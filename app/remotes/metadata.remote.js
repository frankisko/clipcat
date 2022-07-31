const database = require("../database");
const _ = require("underscore");
const moment = require("moment");

module.exports = class MetadataRemote {

    constructor() { }

    getMetadataByIdMetadata(id_metadata) {
        return new Promise((resolve, reject) => {
            database
                .select()
                .from("metadatas")
                .where("metadatas.id_metadata", id_metadata)
                .first()
                .then((row) => {
                    resolve(row);
                });
        });
    }

    getMetadatasByIdCollectionAndType(id_collection, type) {
        return new Promise((resolve, reject) => {
            database
                .select()
                .from("metadatas")
                .where("id_collection", id_collection)
                .andWhere("type", type)
                .orderBy("name", "ASC")
                .then((rows) => {
                    this
                        .countFilesByIdCollectionAndType(id_collection, type)
                        .then((info) => {
                            for (let i = 0; i < rows.length; i++) {
                                let match = _.find(info, (item) => { return rows[i]["id_metadata"] == item["id_metadata"];});

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

    getMetadatasByIdFileAndType(id_file, type) {
        return new Promise((resolve, reject) => {
            database
                .select("metadatas.*")
                .from("metadatas")
                .innerJoin("files_metadatas", "metadatas.id_metadata", "files_metadatas.id_metadata")
                .where("files_metadatas.id_file", id_file)
                .andWhere("metadatas.type", type)
                .orderBy("metadatas.name", "asc")
                .then((rows) => {
                    resolve(rows);
                });
        });
    }

    getMetadatasByType(type, id_collection) {
        return new Promise((resolve, reject) => {
            database
                .select("metadatas.*")
                .from("metadatas")
                .where("metadatas.type", type)
                .andWhere("metadatas.id_collection", id_collection)
                .orderBy('metadatas.name', 'asc')
                .then((rows) => {
                    resolve(rows);
                });
        });
    }

    countFilesByIdCollectionAndType(id_collection, type) {
        return new Promise((resolve, reject) => {
            database("files_metadatas")
                .select(database.raw("metadatas.id_metadata, count(1) AS total"))
                .join("metadatas", "files_metadatas.id_metadata", "metadatas.id_metadata")
                .where("metadatas.id_collection", id_collection)
                .andWhere("metadatas.type", type)
                .groupBy("metadatas.id_metadata")
                .then((rows) => {
                    resolve(rows);
                });
        });
    }

    saveMetadata(data) {
        return new Promise((resolve, reject) => {
            let timestamp = moment().unix();

            data.updated_at = timestamp;

            //update
            if (data["id_metadata"]) {
                let id = data["id_metadata"];
                delete data["id_metadata"];

                database("metadatas")
                    .where("id_metadata", id)
                    .update(data)
                    .then(() => {
                        resolve("ok");
                    });
            } else {
                //insert
                data.created_at = timestamp;

                database
                    .insert(data)
                    .into("metadatas")
                    .then(() => {
                        resolve("ok");
                    });
            }
        });
    }

    deleteMetadataByIdMetadata(id_metadata) {
        return new Promise((resolve, reject) => {
            database("metadatas")
                .where({ id_metadata: id_metadata})
                .delete()
                .then(() => {
                    resolve("ok");
                });
        });
    }

    destroyMetadataByIdMetadata(id_metadata) {
        return new Promise((resolve, reject) => {
            Promise.all([
                this.deleteFilesMetadatasByIdMetadata(id_metadata),
                this.deleteMetadataByIdMetadata(id_metadata)
            ])
            .then((values) => {
                resolve("ok");
            });
        });
    }

    deleteFilesMetadatasByIdMetadata(id_metadata) {
        return new Promise((resolve, reject) => {
            database('files_metadatas')
                .where({'id_metadata': id_metadata})
                .delete()
                .then(() => {
                    resolve("ok");
                });
        });
    }

    deleteFilesMetadatasByIdFile(id_file) {
        return new Promise((resolve, reject) => {
            database('files_metadatas')
                .where({'id_file': id_file})
                .delete()
                .then(() => {
                    resolve("ok");
                });
        });
    }

    deleteFilesMetadatasByIdFiles(id_files) {
        return new Promise((resolve, reject) => {
            database('files_metadatas')
                .whereIn('id_file', id_files)
                .delete()
                .then(() => {
                    resolve("ok");
                });
        });
    }

    deleteFilesMetadatasByIdFileAndType(id_file, type) {
        return new Promise((resolve, reject) => {
            database('files_metadatas')
                .where({'id_file': id_file})
                .andWhereRaw('id_metadata IN (SELECT id_metadata FROM metadatas WHERE type = "' + type + '")')
                .delete()
                .then(() => {
                    resolve("ok");
                });
        });
    }


    duplicatedMetadata(type, name, id_metadata, id_collection) {
        return new Promise((resolve, reject) => {
            let query = database("metadatas")
                .select(database.raw("count(1) AS total"))
                .whereRaw('lower(name) = "' + name.toLowerCase() + '"')
                .andWhere("type", type)
                .andWhere("id_collection", id_collection);

            if (id_metadata) {
                query.andWhereNot("id_metadata", id_metadata);
            }

            query
                .first()
                .then((rows) => {
                    resolve(rows);
                });
        });
    }

    bulkInsert(id_collection, type, metadata) {
        return new Promise((resolve, reject) => {
            //get current metadata
            this
                .getMetadatasByIdCollectionAndType(id_collection, type)
                .then((current_metadata) => {
                    let new_metadata = metadata.split(",");

                    let data = [];

                    let timestamp = moment().unix();

                    for (let i = 0; i < new_metadata.length; i++) {
                        let found = false;

                        if (current_metadata.length > 0) {
                            for (let j = 0; j < current_metadata.length; j++) {
                                if (new_metadata[i].trim().toLowerCase() == current_metadata[j].name.toLowerCase() || new_metadata[i].trim().length == 0) {
                                    found = true;
                                    break;
                                }
                            }
                        }

                        if (!found) {
                            data.push({
                               name: new_metadata[i].trim(),
                               type : type,
                               id_collection : id_collection,
                               created_at : timestamp,
                               updated_at : timestamp
                            });
                        }
                    }

                    console.log(data);

                    if (data.length > 0) {
                        database
                            .batchInsert('metadatas', data, 100)
                            .then(() => {
                                resolve("ok");
                            });
                    } else {
                        resolve("ok");
                    }
            });
        });
    }

    bulkAssociateFile(id_collection, id_file, type, rows) {
        return new Promise((resolve, reject) => {
            Promise.all([
                this.getMetadatasByIdCollectionAndType(id_collection, type),
                this.getMetadatasByIdFileAndType(id_file, type)
            ]).then((values) => {
                //get info from db
                rows = _.filter(values[0], function(row) { return _.contains(rows, row.name); });
                //from found, check missing in db
                rows = _.map(rows, function(row) { return row["id_metadata"] });

                let rowsFile = _.map(values[1], function(row) { return row["id_metadata"] });

                let diff = _.difference(rows, rowsFile);

                if (diff.length > 0) {
                    let data = [];

                    for (let i = 0; i < diff.length; i++) {
                        data.push({
                            id_metadata : diff[i],
                            id_file : id_file
                        });
                    }

                    database
                        .batchInsert("files_metadatas", data, 100)
                        .then(() => {
                            resolve("ok");
                        });
                } else {
                    resolve("ok");
                }
            });
        });
    }
}
