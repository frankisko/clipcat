const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const server = require('./server');

const mainMenu = require('./menu');

let mainWindow;
let scrappingWindow = null;

app.on('ready', () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({ width: 1400, height: 800, show: false/*, minWidth: 1600, minHeight: 800*//*, backgroundColor: "1E1E1E"*/ });

  // and load the index.html of the app.
  mainWindow.loadURL('http://localhost:3002/collection/main');

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  // Emitted when the window is closed.
  mainWindow.on('closed', () => {
      // Dereference the window object, usually you would store windows
      // in an array if your app supports multi windows, this is the time
      // when you should delete the corresponding element.
      if (scrappingWindow != null) {
          scrappingWindow.close();
      }

      mainWindow = null;
  })

  //mainWindow.webContents.openDevTools();
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
      app.quit()
    }
});

app.on('activate', () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
      createWindow()
    }
});

//select collection folder
ipcMain.on('open-directory-dialog', (event) => {
  dialog.showOpenDialog({
    properties: ['openDirectory']
  }, (files) => {
    if (files) event.sender.send('selected-item', files);
  });
});

//bad request in form
ipcMain.on('display-dialog-bad-request', (event) => {
  dialog.showMessageBox({
    type: 'error',
    buttons: ['Ok'],
    title: 'Error',
    message: 'Bad request',
    detail: 'Please fill all required fields',
  }, (index) => {
    console.log(index)
  });
});

//open file
ipcMain.on('open-file', (event, file) => {
  console.log(file)
  shell.openItem(file);
});

//open folder
ipcMain.on('open-folder', (event, folder) => {
  shell.openExternal(folder);
});

//begin scrapping
ipcMain.on('begin-scrapper', (event, id_collection) => {
  console.log("ipc begin-scrapper");
  console.log("scrapping ", id_collection);
  console.log("window is ", scrappingWindow);

  if (scrappingWindow == null) {
    console.log("creating window")
      scrappingWindow = new BrowserWindow({ width: 800, height: 400, maximizable : false, show: false, resizable: false, autoHideMenuBar: true /*, backgroundColor: "1E1E1E"*/ });

      //and load the index.html of the app.
      scrappingWindow.loadURL(`http://localhost:3002/collection/${id_collection}/scrape`);

      scrappingWindow.once('ready-to-show', () => {
          scrappingWindow.show();
      });

      //TODO check if user closes window

      // Emitted when the window is closed.
      scrappingWindow.on('closed', () => {
          // Dereference the window object, usually you would store windows
          // in an array if your app supports multi windows, this is the time
          // when you should delete the corresponding element.
          scrappingWindow = null
      });


      scrappingWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type == "keyUp" && input.key == "Alt") {
            event.preventDefault();
        }
      });

      //scrappingWindow.webContents.openDevTools();
  } else {
      dialog.showMessageBox({
        type: 'error',
        buttons: ['Ok'],
        title: 'Error',
        message: 'Can\'t scrape',
        detail: 'You only can scrape 1 collection at a time',
      }, (index) => {
        console.log(index)
      });
  }
});

ipcMain.on('end-scrapper', (event, id_collection) => {
  console.log("ended scrapping ", id_collection);
  if (scrappingWindow == null) {
    dialog.showMessageBox({
        type: 'error',
        buttons: ['Ok'],
        title: 'Error',
        message: 'Error',
        detail: 'There is no scrapping running',
      }, (index) => {
        console.log(index)
    });
  } else {
      scrappingWindow.close();
  }
});

ipcMain.on('confirm-deletion', (event) => {
  dialog.showMessageBox({
    type: 'warning',
    buttons: ['Ok', 'Cancel'],
    title: 'Confirm deletion',
    message: 'Are you sure you want to delete the record?'
  }, (index) => {
    event.sender.send('deletion-response', index);
  });
});

ipcMain.on('copy-to-clipboard', (event, metadata) => {
  clipboard.writeText(metadata, 'clipboard');
});
