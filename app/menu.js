const { app, Menu } = require('electron');

let template = [
    {
        label: 'File',
        submenu: [
            {
                label: 'Main',
                click: (menuItem, currentWindow) => {
                    currentWindow.webContents.send("go-to-page", "collection/main");
                }
            },
            {
              label: 'Exit',
              click: (menuItem, currentWindow) => {
                app.quit();
              }
          }
        ]
    },
    {
        label: 'Help',
        submenu: [
            {
                label: 'Tutorial',
                click: (menuItem, currentWindow) => {
                  currentWindow.webContents.send("go-to-page", "collection/tutorial");
                }
            },
            {
                label: 'About',
                click: (menuItem, currentWindow) => {
                    currentWindow.webContents.send("about", {});
                }
            }
        ]
    }
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);