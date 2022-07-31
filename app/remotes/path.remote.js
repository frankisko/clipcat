const database = require("../database");

module.exports = class PathRemote {

    constructor() { }

    getPathsByIdCollection(id_collection) {
        return new Promise((resolve, reject) => {
            database
                .select("id_path", "path")
                .from("paths")
                .where("id_collection", id_collection)
                .orderBy("path", "asc")
                .then((rows) => {
                    resolve(rows);
                });
        });
    }

    deletePathsByIdCollection(id_collection) {
        return new Promise((resolve, reject) => {
            database('paths')
                .where({'id_collection': id_collection})
                .delete()
                .then(() => {
                    resolve("delete paths");
                });
        });
    }

    insertNewPathsForCollection(id_collection, paths) {
        return new Promise((resolve, reject) => {
            if (paths.length > 0) {
                const data = paths.map((path) => {
                    return {
                        path: path,
                        depth : (path.match(/path.sep/g) || []).length,
                        id_collection : id_collection
                    };
                });

                database
                    .batchInsert('paths', data, 100)
                    .then(() => {
                        resolve("ok");
                    });
            } else {
                resolve("ok");
            }
        });
    }

    deleteObsoletePathsForCollection(id_collection, paths) {
        return new Promise((resolve, reject) => {
            if (paths.length > 0) {
                database('paths')
                    .whereIn('path', paths)
                    .andWhere('id_collection', id_collection)
                    .delete()
                    .then(() => {
                        resolve("ok");
                    });
            } else {
                resolve("ok");
            }
        });
    }
}
