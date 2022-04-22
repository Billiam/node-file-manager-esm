import debug from 'debug';
import os from 'os';
import fs from 'fs-extra';
import path from 'path';
import origFs from 'fs';
import koaRouter from 'koa-router';
import bodyParser from 'koa-bodyparser';

import Tools from './tools.mjs';
import fileMap from './fileMap.mjs'; const FilePath = fileMap.filePath;
import FileManager from './fileManager.mjs';

const d = debug('fm:routes');


var router = new koaRouter();

router.get('/', async (ctx, next) => {
    d('redirecting to /files');
    ctx.redirect( (ctx.mountPath || '') + '/files');
});

router.get('/files', async (ctx, next) => {
    d('getting files ui');
    ctx.status = 200;
    ctx.type = 'text/html; charset=utf-8';
    ctx.body = await fs.readFile(path.join( NODEFILEMANAGER.BASEPATH, './lib/views/files.html'));
});

router.put('/api/options', async (ctx, next) => {
    var type = ctx.query.type;
    var p = ctx.request.fPath;

    if (!type) {
        ctx.status = 400;
        ctx.body = 'Lack Arg Type';
    } else if (type === 'TOGGLE_SHOW_ALL_FILES') {
        ctx.body = await FileManager.toggleShowAllFiles(null);
    } else if (type === 'GET_SHOW_ALL_FILES') {
        ctx.body = await FileManager.showAllFiles();
    } else if (type === 'SHOW_ALL_FILES_ON') {
        ctx.body = await FileManager.toggleShowAllFiles(true);
    } else if (type === 'SHOW_ALL_FILES_OFF') {
        ctx.body = await FileManager.toggleShowAllFiles(false);
    } else if (type === 'GET_FILE_FILTER') {
        ctx.body = { file: NODEFILEMANAGER.FILEFILTER, mime: NODEFILEMANAGER.MIMEFILTER };
    } else {
        ctx.status = 400;
        ctx.body = 'Arg Type Error!';
    }
});

router.get('/api/(.*)', Tools.loadRealPath, Tools.checkPathExists, async (ctx, next) => {
    var p = ctx.request.fPath;
    var stats = await fs.stat(p);
    if (stats.isDirectory()) {
        ctx.body = await FileManager.list(p);
    } else {
        //ctx.body = await fs.createReadStream(p);
        ctx.body = origFs.createReadStream(p);
    }
});

router.del('/api/(.*)', Tools.loadRealPath, Tools.checkPathExists, async (ctx, next) => {
    var p = ctx.request.fPath;
    await FileManager.remove(p);
    ctx.body = 'Delete Succeeded!';
});

router.put(
    '/api/(.*)',
    Tools.loadRealPath,
    Tools.checkPathExists,
    bodyParser(),
    async (ctx, next) => {
        var type = ctx.query.type;
        var p = ctx.request.fPath;

        d(type + ' -- ' + p);

        if (!type) {
            ctx.status = 400;
            ctx.body = 'Lack Arg Type';
        } else if (type === 'MOVE') {
            var src = ctx.request.body.src;
            if (!src || !(src instanceof Array)) return (ctx.status = 400);
            var src = src.map(function(relPath) {
                return FilePath(relPath, true);
            });
            await FileManager.move(src, p);
            ctx.body = 'Move Succeed!';
        } else if (type === 'RENAME') {
            var target = ctx.request.body.target;
            if (!target) return (ctx.status = 400);
            await FileManager.rename(p, FilePath(target, true));
            ctx.body = 'Rename Succeed!';
        } else {
            ctx.status = 400;
            ctx.body = 'Arg Type Error!';
        }
    }
);

router.post(
    '/api/(.*)',
    Tools.loadRealPath,
    Tools.checkPathNotExists,
    //bodyParser(),
    async (ctx, next) => {
        var type = ctx.query.type;
        var p = ctx.request.fPath;
        if (!type) {
            ctx.status = 400;
            ctx.body = 'Lack Arg Type!';
        } else if (type === 'CREATE_FOLDER') {
            await FileManager.mkdirs(p);
            ctx.body = 'Create Folder Succeed!';
        } else if (type === 'UPLOAD_FILE') {
            // allow big files / no limit - may be dangerous ... slightly
            //let fTmp = path.join(os.tmpdir(), Date.now().toString());    somehow, the files are gone on OSX
            let fTmpUploading = p + '.uploading';
            let fTmpDone = p + '.done';
            let fTmpError = p + '.error';
            await new Promise((resolve, reject) => {
                ctx.req.pipe(fs.createWriteStream(fTmpUploading));
                ctx.req.on('end', async () => {
                    d('Upload: All bytes received: ' + p);
                    await fs.rename(fTmpUploading, fTmpDone); // in case, target exists, or any other error, this file is marked as done.
                    await fs.rename(fTmpDone, p);
                    d('Upload: Finished: ' + p);
                    resolve();
                });
                ctx.req.on('error', async err => {
                    d('Upload: Error: ' + p);
                    await fs.rename(fTmpUploading, fTmpError);
                    reject(err);
                });
                /*
                ctx.req.on('data', (chunk) => {
                    console.log(`Received ${chunk.length} bytes of data.`);
                });
                */
            });

            ctx.status = 200;
            ctx.body = `Uploaded ${ctx.params[0]}`;
        } else if (type === 'CREATE_ARCHIVE') {
            await bodyParser()(ctx, _ => { });

            var src = ctx.request.body.src;
            if (!src) return (ctx.status = 400);
            src = src.map(function(file) {
                return FilePath(file, true);
            });
            var archive = p;
            await FileManager.archive(
                src,
                archive,
                NODEFILEMANAGER.DATA_ROOT,
                !!ctx.request.body.embedDirs
            );
            ctx.body = 'Create Archive Succeed!';
        } else {
            ctx.status = 400;
            ctx.body = 'Arg Type Error!';
        }
    }
);

export default router.middleware();
