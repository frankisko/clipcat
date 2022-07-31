const express = require('express');
const router = express.Router();
const _ = require("underscore");

const tagProperties = require("../properties/tag.properties");
const groupProperties = require("../properties/group.properties");

let properties = {
    tag: tagProperties,
    group: groupProperties
};

router.get('/:type/index', (req, res) => {

    metadataRemote
        .getMetadatasByIdCollectionAndType(req.cookies.id_collection, req.params.type)
        .then((rows) => {
            res.render("metadatas/index/index", {
                active_menu_metadata: true,
                enable_sidebar: true,
                rows: rows,
                type : req.params.type,
                properties: properties[req.params.type],
                id_collection: req.cookies.id_collection
            });
        });
});

//create
router.get('/:type/create', (req, res) => {
    res.render("metadatas/create/create", {
        enable_sidebar: true,
        active_menu_metadata: true,
        type : req.params.type,
        properties: properties[req.params.type],
        id_collection: req.cookies.id_collection
    });
});

//store
router.post('/:type/store', (req, res) => {
    let data = req.body;
    data.type = req.params.type;
    data.id_collection = req.cookies.id_collection;

    metadataRemote
        .saveMetadata(data)
        .then(() => {
            res.redirect("/metadata/" + req.params.type + "/index");
        })
        .catch(() => {
            console.log("failed");
        });
});

//edit
router.get('/:type/:id_metadata/edit', (req, res) => {
    metadataRemote
        .getMetadataByIdMetadata(req.params.id_metadata)
        .then((row) => {
            res.render("metadatas/edit/edit", {
                enable_sidebar: true,
                active_menu_metadata: true,
                row : row,
                type : req.params.type,
                properties: properties[req.params.type],
                id_collection: req.cookies.id_collection
            });
        });
});

//destroy
router.get('/:type/:id_metadata/destroy', (req, res) => {
    metadataRemote
        .destroyMetadataByIdMetadata(req.params.id_metadata)
        .then(() => {
            res.redirect("/metadata/" + req.params.type + "/index");
        })
        .catch(() => {
            console.log("failed");
        });
});

//duplicated
router.get('/:type/duplicated', (req, res) => {
    metadataRemote
        .duplicatedMetadata(req.params.type, req.query.q, req.query.id_metadata, req.cookies.id_collection)
        .then((data) => {
            res.json(data);
        })
        .catch(() => {
            console.log("failed");
        });
});

module.exports = router;