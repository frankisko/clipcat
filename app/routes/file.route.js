const express = require('express');
const router = express.Router();
const _ = require("underscore");
const filesize = require("filesize");
const path = require("path");
const axios = require("axios");
const pathHelper = require("../local_modules/path-helper/path-helper");
const moment = require("moment");
const fs = require("fs");
const https = require('https');

const tagProperties = require("../properties/tag.properties");

let properties = {
    tag: tagProperties
};

//collection files
router.get('/index', (req, res) => {
    let q = "";
    let type = "";
    let tag = "";
    let enable_search = true;

    if (req.query.type) {
        type = req.query.type;
    }

    if (req.query.q) {
        q = req.query.q;
    }

    Promise.all([
        metadataRemote.getMetadatasByIdCollectionAndType(req.cookies.id_collection, "group"),
        metadataRemote.getMetadatasByIdCollectionAndType(req.cookies.id_collection, "tag")
    ]).then((values) => {
        let [groups, tags] = values;

        res.render("files/index/index", {
            enable_sidebar: true,
            enable_topbar : true,
            enable_search : true,
            active_menu_file: true,
            id_collection: req.cookies.id_collection,
            q : q,
            type : type,
            groups: groups,
            tags: tags
        });
    });
});

router.get('/search', (req, res) => {
    fileRemote
        .getCollectionFiles(req.cookies.id_collection, req.query)
        .then((rows) =>{
            //group by path
            let paths = {};

            let counter;

            let file_count = 0;

            _.each(rows, (row) => {
                if (!paths.hasOwnProperty(row.id_path)) {
                    paths[row.id_path] = {
                        id_path : row.id_path,
                        path    : row.path,
                        base_path: '',
                        files  : []
                    };

                    counter = 0;
                }

                let file = row;
                file.full_path = file.path + path.sep + file.filename;
                file.separator = (counter % 8 == 0 && counter > 0);
                file.human_size = filesize(file.size);

                paths[row.id_path]["base_path"] = file.path.replace(file.collection_path, "");
                paths[row.id_path]["files"].push(file);

                file_count++;
                counter++;
            });

            paths = _.sortBy(paths, (row) => {
                return row.path;
            });

            res.json({
                rows : paths,
                file_count: file_count
            });
        });
});

router.get('/:id_file/setMeta', (req, res) => {
    fileRemote
        .setMeta(req.params.id_file)
        .then(() => {
            res.json({status : "success" });
        });
});

//statistics
router.get('/statistics', (req, res) => {
    //get file information
    fileRemote.getFilesStatisticsByIdCollection(req.cookies.id_collection)
        .then((rows) => {
            res.render("files/statistics/statistics", {
                enable_sidebar: true,
                active_menu_file: true,
                rows : rows,
                id_collection: req.cookies.id_collection
            });
        });
});

//info
router.get('/:id_file/info', (req, res) => {
    fileRemote
        .getFileByIdFile(req.params.id_file)
        .then((row) => {
            row.full_path = row.path + path.sep + row.filename;

            Promise.all([
                metadataRemote.getMetadatasByType("group", req.cookies.id_collection),
                metadataRemote.getMetadatasByType("tag", req.cookies.id_collection)
            ]).then((data) => {
                let [groups, tags] = data;

                row.human_size = filesize(row.size);

                let metadata_clipboard = {
                    groups : fileRemote.joinInput(row.groups),
                    tags : fileRemote.joinInput(row.tags)
                };

                let metadatas = {
                    groups : groups,
                    tags : tags
                };

                let metadatas_selected = {
                    groups : row.groups.map(function(value){ return value.id_metadata }),
                    tags : row.tags.map(function(value){ return value.id_metadata })
                }

                let options = {
                    groups :     fileRemote.prepareSelect(groups, "id_metadata", "name", metadatas_selected.groups),
                    tags :       fileRemote.prepareSelect(tags, "id_metadata", "name", metadatas_selected.tags)
                }

                const covers_folder = pathHelper.getCoversFolder(req.cookies.id_collection);

                let cover_exists = false;

                if (fs.existsSync(path.join(covers_folder, row.id_file + '.jpg'))) {
                    cover_exists = true;
                }

                res.render("files/info/info", {
                    enable_sidebar: true,
                    active_menu_file: true,
                    id_collection: req.cookies.id_collection,
                    row: row,
                    tab : (req.query.tab == undefined)? '' : req.query.tab,
                    metadatas : metadatas,
                    options : options,
                    metadata_clipboard: metadata_clipboard,
                    properties: properties,
                    cover_exists: cover_exists
                });
            });
        });
});

//metadata select
router.post('/:id_file/:type/select', (req, res) => {
    metadataRemote
        .deleteFilesMetadatasByIdFileAndType(req.params.id_file, req.params.type)//delete current metadatas for file
        .then(() => {
            let data = [];

            let current_metadatas = req.body.metadatas;

            if (current_metadatas != undefined) {
                //if only one item selected, force array
                if (!Array.isArray(current_metadatas)) {
                    current_metadatas = [current_metadatas];
                }

                for (let i = 0; i < current_metadatas.length; i++) {
                    data.push({
                        id_file : req.params.id_file,
                        id_metadata : current_metadatas[i]
                    });
                }

                //add metadatas to file in bulk
                fileRemote
                    .addMetadataBulk(data)
                    .then(() => {
                        res.redirect("/file/" + req.params.id_file + "/info?tab=" + req.params.type);
                    });
            } else {
                res.redirect("/file/" + req.params.id_file + "/info?tab=" + req.params.type);
            }
    });
});

//metadata by typing
router.post('/:id_file/:type/type', (req, res) => {
    Promise.all([
        metadataRemote.deleteFilesMetadatasByIdFileAndType(req.params.id_file, req.params.type), //delete current metadatas for file
        metadataRemote.bulkInsert(req.cookies.id_collection, req.params.type, req.body.metadatas) //insert typed metadatas if needed
    ]).then(() => {
        metadataRemote
            .getMetadatasByIdCollectionAndType(req.cookies.id_collection, req.params.type)
            .then((current_metadatas) => {
                let data = [];

                if (current_metadatas != undefined) {
                    let typed_metadatas = req.body.metadatas.split(",");

                    for (let i = 0; i < typed_metadatas.length; i++) {
                        for (let j = 0; j < current_metadatas.length; j++) {
                            if (typed_metadatas[i].toLowerCase() == current_metadatas[j].name.toLowerCase()) {
                                data.push({
                                    id_file : req.params.id_file,
                                    id_metadata : current_metadatas[j].id_metadata
                                });
                                break;
                            }
                        }
                    }

                    //add metadatas to file in bulk
                    fileRemote
                        .addMetadataBulk(data)
                        .then(() => {
                            res.redirect("/file/" + req.params.id_file + "/info?tab=" + req.params.type);
                        });
                } else {
                    res.redirect("/file/" + req.params.id_file + "/info?tab=" + req.params.type);
                }
            });
    });
});

//delete scrapping
router.get('/:id_file/delete_scrapping', (req, res) => {
    fileRemote
        .deleteScrappingForIdFile(req.params.id_file, req.cookies.id_collection)
        .then(() => {
            res.redirect("/file/" + req.params.id_file + "/info");
    });
});

//set rating
router.post('/:id_file/rating', (req, res) => {
    fileRemote
        .setFileRating(req.params.id_file, req.body.rating)
        .then(() => {
            res.json({
                "val": "ok"
            });
    });
});

module.exports = router;