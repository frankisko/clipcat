const database = require("../database");
const pathHelper = require("../local_modules/path-helper/path-helper");
const fs = require("fs");
const path = require("path");
const rimraf = require("rimraf");
const _ = require("underscore");
const moment = require("moment");

module.exports = class FileRemote {

    constructor() { }

    getFileByIdFile(id_file) {
        return new Promise((resolve, reject) => {
            database
                .select("files.*", "paths.path", "collections.name AS collection_name")
                .from("files")
                .innerJoin("paths", "files.id_path", "paths.id_path")
                .innerJoin("collections", "files.id_collection", "collections.id_collection")
                .where("files.id_file", id_file)
                .first()
                .then((row) => {
                    Promise.all([
                        metadataRemote.getMetadatasByIdFileAndType(id_file, "group"),
                        metadataRemote.getMetadatasByIdFileAndType(id_file, "tag")
                    ]).then((values) => {
                        row.groups = values[0];
                        row.tags = values[1];

                        resolve(row);
                    });
                });
        });
    }

    getCollectionFiles(id_collection, query_params) {
        return new Promise((resolve, reject) => {
            if (query_params == undefined) {
                query_params = null;
            }

            let query = database
                .select("files.*", "paths.path", "collections.path AS collection_path",
                    database.raw(`( SELECT COUNT(1)
                                    FROM files_metadatas INNER JOIN metadatas ON files_metadatas.id_metadata = metadatas.id_metadata
                                    WHERE files.id_file = files_metadatas.id_file
                                    AND metadatas.type = 'group') AS groups_count`),
                    database.raw(`( SELECT COUNT(1)
                                    FROM files_metadatas INNER JOIN metadatas ON files_metadatas.id_metadata = metadatas.id_metadata
                                    WHERE files.id_file = files_metadatas.id_file
                                    AND metadatas.type = 'tag') AS tags_count`)
                )
                .from("files")
                .innerJoin("paths", "files.id_path", "paths.id_path")
                .innerJoin("collections", "files.id_collection", "collections.id_collection")
                .where("files.id_collection", id_collection)
                .orderBy([
                    { column: 'paths.path', order: 'asc' },
                    { column: 'files.name', order: 'asc' }
                ]);

                if (query_params != null && query_params.text) {
                    switch(query_params.type) {
                        case "filename":
                            query.andWhere('files.name', 'like', '%' + query_params.text + '%');
                            break;
                        case "path" :
                            query.andWhere('paths.path', 'like', '%' + query_params.text + '%');
                            break;
                    }
                }

            //visibility
            if (query_params != null && query_params.visibility != null && query_params.visibility != "") {
                if (query_params.visibility == "viewed") {
                    query.andWhere('files.view_count', '>', 0);
                }

                if (query_params.visibility == "not_viewed") {
                    query.andWhere('files.view_count', 0);
                }
            }

            //rating
            if (query_params != null && query_params.rating != null && query_params.rating != "") {
                query.andWhere('files.rating', 'in', query_params.rating.split(","));
            }

            //metadata filters
            if (query_params != null) {
                let metadatas_tmp = "";

                if (query_params.groups != null && query_params.groups != "") {
                    metadatas_tmp = query_params.groups;
                }

                if (query_params.tags != null && query_params.tags != "") {
                    if (metadatas_tmp == "") {
                        metadatas_tmp = query_params.tags;
                    } else {
                        metadatas_tmp += "," + query_params.tags;
                    }
                }

                if (metadatas_tmp != "") {
                    let metadatas = metadatas_tmp.split(",");

                    for (let i = 0; i < metadatas.length; i++) {
                        query.andWhereRaw(`(
                            SELECT count(1)
                            FROM files_metadatas
                            WHERE files.id_file = files_metadatas.id_file
                            AND files_metadatas.id_metadata = ${metadatas[i]}
                            ) = 1`);
                    }
                }
            }

            query.then((rows) => {
                resolve(rows);
            });
        });
    }

    getFilesStatisticsByIdCollection(id_collection) {
        return new Promise((resolve, reject) => {
            database
                .select(
                    "files.*",
                    database.raw(`(SELECT COUNT(1)
                                    FROM files_metadatas
                                    INNER JOIN metadatas ON files_metadatas.id_metadata = metadatas.id_metadata
                                    WHERE files.id_file = files_metadatas.id_file
                                    AND metadatas.type = 'tag'
                                  ) AS tags_count`
                    )
                )
                .from("files")
                .where("files.id_collection", id_collection)
                .orderBy([
                    { column: 'files.name', order: 'asc' }
                ]).then((rows) => {
                    resolve(rows);
                });
        });
    }

    getFileToScrape(id_collection) {
        return new Promise((resolve, reject) => {
            database
                .select("files.*", "paths.path")
                .from("files").innerJoin("paths", "files.id_path", "paths.id_path")
                .where("files.id_collection", id_collection)
                .andWhere("files.scrapped", 0)
                .first()
                .then((file) => {
                    if (file == undefined) {
                        //no more files to scrape
                        resolve("done");
                    } else {
                        ffmpegRemote
                            .getInfo(file.path, file.filename) //get info about video
                            .then((info) => {
                                file.duration = info.duration;
                                file.size     = info.size;

                                this.setFileInfo(file, info)
                                    .then(() => {
                                        resolve(file);
                                    });
                        });
                    }
                });
        });
    }

    setFileInfo(file, info) {
        return new Promise((resolve, reject) => {
            database('files')
                .where("id_file", file.id_file)
                .update(info)
                .then(() => {
                    resolve("ok");
                });
        });
    }

    scrapeFile(id_collection) {
        return new Promise((resolve, reject) => {
            this.getFileToScrape(id_collection)
                .then((file) => {
                    if (file == "done") {
                        resolve("done");
                    } else {
                        Promise.all([
                            ffmpegRemote.generateThumbnail(id_collection, file), //generate thumbnail
                            ffmpegRemote.generatePreview(id_collection, file) //generate preview
                        ]).then((values) => {
                            let info = {
                                scrapped: 1
                            };

                            this.setFileInfo(file, info)
                                .then(() => {
                                    resolve(file);
                                });
                        });
                    }
                });
        });
    }

    deleteFilesByIdCollection(id_collection) {
        return new Promise((resolve, reject) => {
            database('files')
                .where({'id_collection': id_collection})
                .delete()
                .then(() => {
                    resolve("delete files");
                });
        });
    }

    markAsScrapped(id_files) {
        return new Promise((resolve, reject) => {
            if (id_files.length > 0) {
                database('files')
                    .whereIn("id_file", id_files)
                    .update({
                        scrapped : 1
                    }).then(() => {
                        resolve("ok");
                    });
            } else {
                resolve("ok");
            }
        });
    }

    markCollectionFilesAsPendingScrapped(id_collection) {
        return new Promise((resolve, reject) => {
            database('files')
                .where("id_collection", id_collection)
                .update({
                    scrapped : 0
                }).then(() => {
                    resolve("ok");
                });
        });
    }

    markFileAsPendingScrapped(id_file) {
        return new Promise((resolve, reject) => {
            database('files')
                .where("id_file", id_file)
                .update({
                    scrapped : 0
                }).then(() => {
                    resolve("ok");
                });
        });
    }

    markFilesAsPendingScrapped(id_files) {
        return new Promise((resolve, reject) => {
            database('files')
                .whereIn("id_file", id_files)
                .update({
                    scrapped : 0
                }).then(() => {
                    resolve("ok");
                });
        });
    }

    insertNewFiles(data) {
        return new Promise((resolve, reject) => {
            database
                .batchInsert('files', data, 100)
                .then(() => {
                    resolve("ok");
                })
                .catch((error) => {
                    reject(error);
                });
        });
    }

    deleteObsoleteFiles(id_files, id_collection) {
        return new Promise((resolve, reject) => {
            if (id_files.length > 0) {
                database("files")
                    .whereIn("id_file", id_files)
                    .delete()
                    .then(() => {
                        Promise.all([
                            metadataRemote.deleteFilesMetadatasByIdFiles(id_files),
                            this.deleteScrappingForIdFiles(id_files, id_collection)
                        ]).then(()=> {
                            resolve("ok");
                        });
                });
            } else {
                resolve("ok");
            }
        });
    }

    countFiles(id_collection) {
        return new Promise((resolve, reject) => {
            database("files")
                .where("id_collection", id_collection)
                .count("id_file as count")
                .then((rows) => {
                    resolve(rows[0].count);
                });
        });
    }

    countPendingFiles(id_collection) {
        return new Promise((resolve, reject) => {
            database("files")
                .where("id_collection", id_collection)
                .andWhere("scrapped", 0)
                .count("id_file as count")
                .then((rows) => {
                    resolve(rows[0].count);
                });
        });
    }

    countFilesByCollection() {
        return new Promise((resolve, reject) => {
            database("files")
                .select(database.raw("id_collection, count(1) AS total"))
                .groupBy("id_collection")
                .then((rows) => {
                    resolve(rows);
                });
        });
    }

    setMeta(id_file) {
        return new Promise((resolve, reject) => {
            let timestamp = moment().unix();

            database('files')
                .where("id_file", id_file)
                .update({
                    "last_viewed" : timestamp
                })
                .increment("view_count", 1)
                .then(() => {
                    resolve("ok");
                });
        });
    }

    removeTmpFiles() {
        const tmp_folder = pathHelper.getTmpFolder();

        for (let i = 0; i <= 19; i++) {
            let filepath = path.join(tmp_folder, 'chunk' + i + '.mp4');

            fs.unlink(filepath, (err) => {});
        }
    }

    addMetadataBulk(data) {
        return new Promise((resolve, reject) => {
            database
                .batchInsert('files_metadatas', data, 100)
                .then(() => {
                    resolve("ok");
                });
        });
    }

    deleteScrappingForIdFile(id_file, id_collection) {
        return new Promise((resolve, reject) => {
            const thumbnails_folder = pathHelper.getThumbnailsFolder(id_collection);
            const previews_folder = pathHelper.getPreviewsFolder(id_collection);
            const covers_folder = pathHelper.getCoversFolder(id_collection);

            Promise.all([
                fs.unlink(path.join(thumbnails_folder, id_file.toString() + '.jpg'), (err) => {}),
                fs.unlink(path.join(previews_folder, id_file.toString() + '.mp4'), (err) => {}),
                fs.unlink(path.join(covers_folder, id_file.toString() + '.jpg'), (err) => {}),
                this.markFileAsPendingScrapped(id_file)
            ]).then(() => {
                resolve("ok");
            });
        });
    }

    deleteScrappingForIdFiles(id_files, id_collection) {
        return new Promise((resolve, reject) => {
            const thumbnails_folder = pathHelper.getThumbnailsFolder(id_collection);
            const previews_folder = pathHelper.getPreviewsFolder(id_collection);
            const covers_folder = pathHelper.getCoversFolder(id_collection);

            let promises = [];

            if (id_files.length > 0) {
                for (let i = 0; i < id_files.length; i++) {
                    promises.push(fs.unlink(path.join(thumbnails_folder, id_files[i].toString() + '.jpg'), (err) => {}));
                    promises.push(fs.unlink(path.join(previews_folder, id_files[i].toString() + '.mp4'), (err) => {}));
                    promises.push(fs.unlink(path.join(covers_folder, id_files[i].toString() + '.jpg'), (err) => {}));
                }
            }

            promises.push(this.markFilesAsPendingScrapped(id_files));

            Promise.all([
                promises
            ]).then(() => {
                resolve("ok");
            });
        });
    }

    setFileRating(id_file, rating) {
        return new Promise((resolve, reject) => {
            database('files')
                .where("id_file", id_file)
                .update({"rating": rating})
                .then(() => {
                    resolve("ok");
                });
        });
    }

    joinInput(data) {
        return _.map(data, (value) => {
            return value.name;
        }).join(",");
    }

    prepareSelect(rows, id, text, selected) {
        return rows.map(function(row) {
            return {
                "value": row[id],
                "text": row[text],
                "selected": selected.indexOf(row[id]) != -1
            }}
        );
    }

    setSelected(catalog, rows) {
        for (let i = 0; i < catalog.length; i++) {
            let found = false;

            for (let j = 0; j < rows.length; j++) {
                if (catalog[i]["id_metadata"] == rows[j]["id_metadata"]) {
                    found = true;
                    break;
                }
            }

            catalog[i].selected = (found)? true : false;
        }

        return catalog;
    }

    saveUrl(id_file, url) {
        return new Promise((resolve, reject) => {
            let data = {
                url : url.trim()
            };

            database("files")
                .where("id_file", id_file)
                .update(data)
                .then(() => {
                    resolve("ok");
                });
        });
    }
}