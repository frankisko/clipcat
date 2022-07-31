module.exports = {
    walkTree: function(tree, paths) {
        if (paths == null) {
            paths = [];
        }

        if (tree.type == "directory") {
            paths.push(tree.path);

            for (let i = 0; i < tree.children.length; i++) {
                this.walkTree(tree.children[i], paths);
            }
        }

        return (paths);
    },

    walkFiles: function(tree, paths) {
        if (paths == null) {
            paths = [];
        }

        if (tree.type == "directory") {
            for (let i = 0; i < tree.children.length; i++) {
                this.walkFiles(tree.children[i], paths);
            }
        } else {
            paths.push(tree.path);
        }

        return (paths);
    },

    walkFilesInfo : function(tree, paths) {
        if (paths == null) {
            paths = [];
        }

        if (tree.type == "directory") {
            for (let i = 0; i < tree.children.length; i++) {
                this.walkFilesInfo(tree.children[i], paths);
            }
        } else {
            paths.push({
                path: tree.path,
                size: tree.size
            });
        }

        return (paths);
    }
};