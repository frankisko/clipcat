const database = require("../database");
const treeHelper = require("../local_modules/tree-helper/tree-helper");
const pathHelper = require("../local_modules/path-helper/path-helper");
const dirTree = require("directory-tree");
const _ = require("underscore");
const path = require("path");
const fs = require("fs");
const os = require("os");
const rimraf = require("rimraf");
const moment = require("moment");

module.exports = class CollectionRemote {

    constructor() { }

    getCollectionByIdCollection(id_collection) {
        return new Promise((resolve, reject) => {
            database
                .select()
                .from("collections")
                .where("id_collection", id_collection)
                .first()
                .then((row) => {
                    resolve(row);
                });
        });
    }

    getCollections() {
        return new Promise((resolve, reject) => {
            database
                .select()
                .from("collections")
                .then((rows) => {
                    fileRemote
                        .countFilesByCollection()
                        .then((info) => {
                            for (let i = 0; i < rows.length; i++) {
                                let match = _.find(info, (item) => { return rows[i].id_collection == item.id_collection;});

                                if (match == undefined) {
                                    rows[i].total = 0;
                                } else {
                                    rows[i].total = match.total;
                                }
                            }

                            resolve(rows);
                        });
                });
        });
    }

    saveCollection(data) {
        return new Promise((resolve, reject) => {
            let timestamp = moment().unix();
            data.created_at = timestamp;
            data.updated_at = timestamp;

            database
                .insert(data, ['id_collection'])
                .into('collections')
                .then((id_collection) => {
                    resolve(id_collection);
                });
        });
    }

    deleteCollectionByIdCollection(id_collection) {
        return new Promise((resolve, reject) => {
            database('collections')
                .where({'id_collection': id_collection})
                .delete()
                .then(() => {
                    resolve("ok");
                });
        });
    }

    destroyCollectionByIdCollection(id_collection) {
        return new Promise((resolve, reject) => {
            Promise.all([
                fileRemote.deleteFilesByIdCollection(id_collection),
                pathRemote.deletePathsByIdCollection(id_collection),
                this.deleteCollection(id_collection)
            ])
            .then((values) => {
                const collection_folder = pathHelper.getCollectionFolder(id_collection);

                rimraf(collection_folder, () => {
                    resolve("ok");
                });
            });
        });
    }

    setTreeCollection(collection) {
        return new Promise((resolve, reject) => {
            //get tree
            const tree = this.getTree(collection.path);

            database('collections')
                .where("id_collection", collection.id_collection)
                .update({
                    tree : JSON.stringify(tree)
                })
                .then(() => {
                    resolve(tree);
                });
        });
    }

    setCollectionLastUpdated(id_collection) {
        return new Promise((resolve, reject) => {
            const timestamp = moment().unix();

            database("collections")
                .where("id_collection", id_collection)
                .update({
                    updated_at : timestamp
                })
                .then(() => {
                    resolve("ok");
                });
        });
    }

    structureCollection(id_collection) {
        return new Promise((resolve, reject) => {
            const timestamp = moment().unix();

            const collection_folder = pathHelper.getCollectionFolder(id_collection);

            const tmp_folder = pathHelper.getTmpFolder(id_collection);

            //create collection folder if doesnt exist
            if (!fs.existsSync(collection_folder)) {
                fs.mkdirSync(collection_folder);
                fs.mkdirSync(path.join(collection_folder, 'previews'));
                fs.mkdirSync(path.join(collection_folder, 'thumbnails'));
                fs.mkdirSync(path.join(collection_folder, 'covers'));
            }

            //create chunk list
            const chunk_list = path.join(tmp_folder, 'chunk_list.txt');

            let data = '';

            for (let i = 0; i < 20; i++) {
                data += 'file ' + path.join(tmp_folder, "chunk" + i + ".mp4") + '' + os.EOL;
            }

            if (os.platform() == "win32") {
                //invert slashes
                data = data.replace(/\\/g, "/");
            }

            fs.writeFileSync(chunk_list, data);

            //first, get collection path
            this.getCollectionByIdCollection(id_collection)
                .then((collection) => {
                    this.setTreeCollection(collection) //set tree for collection
                        .then((tree) => {
                            //paths
                            let fs_paths = treeHelper.walkTree(tree);

                            //files
                            let fs_files = treeHelper.walkFiles(tree);

                            let fs_files_info = treeHelper.walkFilesInfo(tree);

                            Promise.all([
                                pathRemote.getPathsByIdCollection(id_collection), //get paths
                                fileRemote.getCollectionFiles(id_collection, null), //get files
                                fileRemote.markCollectionFilesAsPendingScrapped(id_collection), //mark files as pending scrapped
                                this.setCollectionLastUpdated(id_collection)//set last updated for collection
                            ]).then((values) => {
                                const db_paths = values[0];
                                const db_files = values[1];

                                const name_paths = db_paths.map(item => item.path);

                                //paths refresh
                                const new_paths = _.difference(fs_paths, name_paths);
                                const obsolete_paths = _.difference(name_paths, fs_paths);

                                Promise.all([
                                    pathRemote.insertNewPathsForCollection(id_collection, new_paths),
                                    pathRemote.deleteObsoletePathsForCollection(id_collection, obsolete_paths)
                                ]).then(() => {
                                    pathRemote
                                        .getPathsByIdCollection(id_collection)
                                        .then((paths) => {
                                            //files refresh
                                            const new_files_add = _.difference(fs_files, db_files.map(item => { return item.path + path.sep + item.filename}));
                                            let new_files = [];

                                            for (let i = 0; i < new_files_add.length; i++) {
                                                let fs_filepaths_chunks = new_files_add[i].split(path.sep);
                                                const filename = fs_filepaths_chunks.pop();

                                                let db_path = paths.find((item) => {
                                                    return item.path == fs_filepaths_chunks.join(path.sep);
                                                });

                                                new_files.push({
                                                    name    : filename.substr(0, filename.lastIndexOf(".")),
                                                    filename: filename,
                                                    id_path : db_path.id_path,
                                                    id_collection: id_collection,
                                                    scrapped: 0,
                                                    duration: 0,
                                                    size: 0,
                                                    created_at: timestamp,
                                                    updated_at: timestamp
                                                });
                                            }

                                            let obsolete_files = [];

                                            for (let i = 0; i < db_files.length; i++) {
                                                let found = false;

                                                let db_file_path = db_files[i].path + path.sep + db_files[i].filename;

                                                for (let j = 0; j < fs_files.length; j++) {
                                                    if (db_file_path == fs_files[j]) {
                                                        found = true;
                                                        break;
                                                    }
                                                }

                                                if (!found) {
                                                    obsolete_files.push(db_files[i].id_file);
                                                }
                                            }

                                            //if file exists in db and fs but is different size, delete scrapping if exists
                                            let delete_files_scrape = [];

                                            for (let i = 0; i < db_files.length; i++) {
                                                for (let j = 0; j < fs_files_info.length; j++) {
                                                    if (path.join(db_files[i].path, path.sep, db_files[i].filename) == fs_files_info[j].path) {
                                                        if (db_files[i].size != fs_files_info[j].size) {
                                                            delete_files_scrape.push(
                                                                fileRemote.deleteScrappingForIdFile(db_files[i].id_file, id_collection)
                                                            );
                                                        }
                                                        break;
                                                    }
                                                }
                                            }

                                            Promise
                                                .all(delete_files_scrape)
                                                .then(() => {
                                                    //get tree for current collection
                                                    const public_collection = pathHelper.getThumbnailsFolder(id_collection);

                                                    const public_collection_tree = dirTree(public_collection, { extensions: /\.(jpg)$/ });

                                                    let public_collection_files = treeHelper.walkFiles(public_collection_tree);
                                                    public_collection_files = public_collection_files.map((item) => {
                                                        let chunks_by_sep = item.split(path.sep);
                                                        const chunk_filename = chunks_by_sep.pop();
                                                        return parseInt(chunk_filename.substr(0, chunk_filename.lastIndexOf(".")));
                                                    });

                                                    const files_ids = db_files.map((item) => {
                                                        return item.id_file;
                                                    });

                                                    const scrapped_files = _.intersection(files_ids, public_collection_files);

                                                    Promise.all([
                                                        fileRemote.insertNewFiles(new_files),
                                                        fileRemote.deleteObsoleteFiles(obsolete_files, id_collection),
                                                        fileRemote.markAsScrapped(scrapped_files)
                                                    ]).then(() => {
                                                        resolve("ok");
                                                    });
                                                });
                                        });
                                });
                            });
                        });
            });
        });
    }

    getTree(path) {
        //get tree
        const tree = dirTree(path, {
            extensions: /\.(mp4|flv|avi|wmv|mpeg|mpg|mkv|m4v|webm)$/
        });

        return tree;
    }
}
