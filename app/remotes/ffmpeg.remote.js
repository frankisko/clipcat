const fs = require("fs");
const path = require("path");
const pathHelper = require("../local_modules/path-helper/path-helper");
const { exec } = require('child_process');
const os = require("os");

module.exports = class FFMPEGRemote {

    constructor() {
    }

    getFFMPEG() {
        let ffmpeg_exe = "ffmpeg";
        if (os.platform() == "win32") {
            ffmpeg_exe += ".exe";
        }

        return path.join(__dirname, '..', 'libs', 'ffmpeg', ffmpeg_exe).replace(path.sep + 'app.asar', '');
    }

    generateThumbnail(id_collection, file)  {
        return new Promise((resolve, reject) => {
            //console.log("start generating thumbnail");

            const collection_folder = pathHelper.getCollectionFolder(id_collection);

            fs.access(path.join(collection_folder, 'thumbnails', file.id_file.toString() + '.jpg'), fs.constants.F_OK, (err) => {
                if (err) {
                    let ffmpeg_exe = "ffmpeg";
                    if (os.platform() == "win32") {
                        ffmpeg_exe += ".exe";
                    }

                    const ffmpeg_path = path.join(__dirname, '..', 'libs', 'ffmpeg', ffmpeg_exe).replace(path.sep + 'app.asar', '');

                    const thumbnails_folder = pathHelper.getThumbnailsFolder(id_collection);

                    const seek_length = Math.floor(file.duration / 10);

                    const command = ffmpeg_path +
                                    ' -ss ' + seek_length +
                                    ' -i "'  + path.join(file.path, file.filename) + '"' +
                                    ' -vf "scale=350:200:force_original_aspect_ratio=decrease,pad=350:200:(ow-iw)/2:(oh-ih)/2"' +
                                    ' -y' +
                                    ' -nostats' +
                                    ' -loglevel 0' +
                                    ' "' + path.join(thumbnails_folder, file.id_file.toString() + '.jpg') + '"';

                    //console.log(command);

                    exec(command, (error, stdout, stderr) => {
                        //console.log("end generating thumbnail");
                        resolve("ok");
                    });
                } else {
                    resolve("ok");
                }
            });
        });
    }

    generateFileChunk(data) {
        return new Promise((resolve, reject) => {
            exec(data.command, (error, stdout, stderr) => {
                resolve("ok");
            });
        });
    }

    generatePreview(id_collection, file) {
        return new Promise((resolve, reject) => {
            //console.log("start generating preview");

            const previews_folder = pathHelper.getPreviewsFolder(id_collection);
            const tmp_folder = pathHelper.getTmpFolder();

            fs.access(path.join(previews_folder, file.id_file.toString() + '.mp4'), fs.constants.F_OK, (err) => {
                if (err) {
                    const ffmpeg = this.getFFMPEG();

                    let segments_chunks = 20;

                    const segments_duration = 1;

                    const thumbnail_width = 350;
                    const thumbnail_height = 200;

                    //if file is too short, set less chunks
                    if (file.duration < 30) {
                        segments_chunks = 5;
                    }

                    const seek_length = Math.floor(file.duration / segments_chunks);

                    let commands = [];

                    for (let i = 0; i < segments_chunks; i++) {
                        //calculate seeking
                        let seeking = 0 + (seek_length * i);

                        //create animated chunks
                        let command = ffmpeg +
                                       ' -ss ' + seeking +
                                       ' -t ' + segments_duration +
                                       ' -i "' + path.join(file.path, file.filename) + '"' +
                                       ' -an ' +
                                       ' -y ' +
                                       //' -nostats' +
                                       //' -loglevel 0' +
                                       ' -s ' + thumbnail_width + 'x' + thumbnail_height +
                                       ' -vf "scale=350:200:force_original_aspect_ratio=decrease,pad=350:200:(ow-iw)/2:(oh-ih)/2,setpts=0.5*PTS"' +
                                       ' "' + path.join(tmp_folder, 'chunk' + i + '.mp4') + '"';

                        //console.log(command);
                        commands.push(this.generateFileChunk({ command: command }));
                    }

                    //execute 4 chunks each time
                    Promise.all(commands.slice(0, 4)) //0-3
                        .then((values) => {
                            Promise.all(commands.slice(4, 8)) //4-7
                                .then((values) => {
                                    Promise.all(commands.slice(8, 12)) //8-11
                                    .then((values) => {
                                        Promise.all(commands.slice(12, 16)) //12-15
                                        .then((values) => {
                                            Promise.all(commands.slice(16, 20)) //16-19
                                            .then((values) => {
                                                //join all chunks
                                                let join_command =
                                                ffmpeg +
                                                    ' -f concat' +
                                                    ' -safe 0' +
                                                    ' -i "' + path.join(tmp_folder, 'chunk_list.txt') + '"' +
                                                    ' -c copy "' + path.join(previews_folder, file.id_file.toString() + '.mp4') + '"';

                                                //console.log(join_command);

                                                exec(join_command, (error, stdout, stderr) => {
                                                    //console.log("end generating preview");

                                                    resolve("ok");
                                                });
                                            });
                                        });
                                    });
                                });
                        });
                } else {
                    resolve("ok");
                }
            });
        });
    }

    getInfo(file_path, file_name) {
        return new Promise((resolve, reject) => {
            //console.log("start get info");

            let ffprobe_exe = "ffprobe";
            if (os.platform() == "win32") {
                ffprobe_exe += ".exe";
            }

            const ffprobe = path.join(__dirname, '..', 'libs', 'ffmpeg', ffprobe_exe).replace(path.sep + 'app.asar', '');

            const command = ffprobe +
                            ' -v error' +
                            ' -show_entries' +
                            ' format=duration,size' +
                            ' -of'+
                            ' default=noprint_wrappers=1:nokey=1' +
                            ' "' + path.join(file_path, file_name) + '"';

            exec(command, (error, stdout, stderr) => {
                stdout = stdout.replace(/(\r\n|\n|\r)/gm," ");

                const chunks = stdout.split(" ");

                const data = {
                    duration : Math.round(chunks[0]),
                    size     : chunks[1]
                };

                //console.log("end get info");

                resolve(data);
            });
        });
    }
}