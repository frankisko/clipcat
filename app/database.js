const path = require('path');

const dbPath = path.join(__dirname, 'data', 'db.sqlite').replace(path.sep + 'app.asar', '');

const database = require("knex")({
    client: 'sqlite3',
    connection: {
        filename: dbPath
    },
    useNullAsDefault: true
});

module.exports = database;