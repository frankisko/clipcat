const express = require('express');
const router = express.Router();
const _ = require("underscore");

//main
router.get('/main', (req, res) => {
    collectionRemote
        .getCollections()
        .then((rows) => {
            res.render("collections/main/main", {
                "rows": rows
            });
        });
});

//select
router.get('/:id_collection/select', (req, res) => {
    res.cookie('id_collection', req.params.id_collection, { expires: 0 });
    res.redirect('/file/index');
});

//store
router.post('/store', (req, res) => {
    collectionRemote
        .saveCollection(req.body)
        .then((id_collection) => {
            res.redirect("/collection/" + id_collection + "/select");
        })
        .catch(() => {
            console.log("failed");
        });
});

//destroy
router.get('/:id_collection/destroy', (req, res) => {
    collectionRemote
        .destroyCollectionByIdCollection(req.params.id_collection)
        .then(() => {
            res.redirect("/collection/main");
        })
        .catch(() => {
            console.log("failed");
        });
});

//structure
router.get('/:id_collection/structure', (req, res) => {
    collectionRemote
        .structureCollection(req.params.id_collection)
        .then(() => {
            res.render("collections/structure/structure", {
                id_collection : req.cookies.id_collection
            });
        });
});

//collection scrape
router.get('/:id_collection/scrape', (req, res) => {
    res.render("collections/scrape/scrape", {
        id_collection : req.params.id_collection
    });
});

router.get('/:id_collection/scrapping', (req, res) => {
    Promise.all([
        fileRemote.countFiles(req.params.id_collection),
        fileRemote.countPendingFiles(req.params.id_collection)
    ]).then((values) => {
        const count_files = values[0];
        const pending_files = values[1];

        const scrapped_files = count_files - pending_files;

        const progress = ((scrapped_files * 100) / count_files).toFixed(2);

        fileRemote
            .scrapeFile(req.params.id_collection)
            .then((file) => {
                if (pending_files == 0) {
                    //if no more files to process, then delete tmp files
                    fileRemote.removeTmpFiles();
                }

                res.json({
                    id_collection : req.cookies.id_collection,
                    progress: progress,
                    file: file,
                    left : pending_files
                });
            });
    });
});

router.get('/tutorial', (req, res) => {
    res.render("collections/tutorial/tutorial");
});

module.exports = router;
