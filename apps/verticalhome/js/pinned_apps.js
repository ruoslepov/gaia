'use strict';

(function (exports) {

  function PinnedAppItem(index, entry) {
    if (index === null || index === undefined){
      return false;
    }
    this.index = index;
    //creating pinned app element
    var pinnedElem = document.createElement('div');
    var pinnedAppIcon = document.createElement('img');
    var pinnedAppTitle = document.createElement('span');
    var pinnedList = document.getElementById('pinned-apps-list');
    var moreAppsLi = document.getElementById('moreApps');
    var unreadNotif = document.createElement('div');


    pinnedElem.className = 'pinned-app-item';
    pinnedAppIcon.className = 'pinned-app-icon';
    pinnedAppTitle.className = 'title';
    unreadNotif.className = 'unread_notif';

    pinnedElem.setAttribute('data-index', this.index);
    pinnedElem.appendChild(pinnedAppIcon);
    pinnedElem.appendChild(pinnedAppTitle);
    pinnedElem.appendChild(unreadNotif);

    pinnedList.insertBefore(pinnedElem, moreAppsLi);

    this.element = pinnedElem;
    this.icon = pinnedAppIcon;
    this.title = pinnedAppTitle;

    if (entry){
      this.entry = entry;
      this.entry.index = this.index;
      this.targetApp = app.getAppByURL(this.entry.manifestURL);
      this.render();
    }
  }

  PinnedAppItem.prototype = {

    render: function() {

      var self = this;
      function getName() {
        var name = self.entry.locales[document.documentElement.lang].name;
        return  name ? name : self.entry.name;
      }

      //TODO: it is necessary to delete elements from pinned app list from
      //page not hide them and refresh target app for example when application
      //is being uninstalled.
      if(this.targetApp) {
        var manifest = this.targetApp.manifest;
        var entry_point = this.entry.entry_point;
        var appIcons = [];

        this.icon.style.visibility = 'visible';
        this.title.style.visibility = 'visible';

        if (this.entry){
          this.element.addEventListener('click', this);

          this.element.dataset.manifesturl = this.entry.manifestURL;
          this.element.dataset.entrypoint = this.entry.entry_point;

          if (manifest.entry_points) {
            if (entry_point) {
              appIcons = manifest.entry_points[entry_point].icons;
            }else{
              console.error('Entry point must be defined');
            }
          } else {
            appIcons = manifest.icons;
          }

          for (var size in appIcons) {
            if (size >= 75) {
              var mainURL = this.entry.manifestURL.split('/');
              mainURL.splice(-1, 1);
              this.icon.src = mainURL.join('/') + appIcons[size];
              break;
            }
          }

          if (this.entry.locales) {
            this.title.textContent = getName();
          } else {
            this.entry.locales = manifest.entry_points && entry_point ?
              manifest.entry_points[entry_point].locales :
              manifest.locales;
            this.title.textContent = getName();
          }
        }

      } else {
        this.icon.style.visibility = 'hidden';
        this.title.style.visibility = 'hidden';
      }
    },

    refreshDomElem: function(elem){
      this.element = elem;
      this.icon = this.element.querySelector('.pinned-app-icon');
      this.title = this.element.querySelector('.title');
      this.render();
    },

    clear: function() {
      this.entry = {
        entry_point: null,
        name: null,
        manifest: null,
        index: this.index
      };
      this.element.removeEventListener('click', this);
      this.targetApp = null;
    },

    launch: function() {
      if(!this.targetApp) {
        return;
      }

      if(this.entry.entry_point) {
        this.targetApp.launch(this.entry.entry_point);
      } else {
        this.targetApp.launch();
      }
    },

    getEntry: function() {
      return this.entry;
    },

    save: function() {
      app.savePinnedAppItem(this.entry);
    },

    handleEvent: function(e) {
      this.launch();
    }
  };

  function PinnedAppsManager() {
    if (PinnedAppsManager.instance){
      return PinnedAppsManager.instance;
    }

    PinnedAppsManager.instance = this;

    this.items = [];
    this._storeRef = null;
  }

  PinnedAppsManager.prototype = {
    STORE_NAME: 'notifications_count',
    init: function () {
      var pinnedAppsList = app.getPinnedAppsList();
      for (var i = 0; i < pinnedAppsList.length; i++) {
        this.items[i] = new PinnedAppItem(i, pinnedAppsList[i]);
      }

      this.items.sort(function(elem1, elem2) {
        return elem1.index - elem2.index;
      });

      this.initStore().then(store => {
        store.onchange = e => {
          switch (e.operation) {
          case 'removed':
            this.debug('REMOVED last notification for ' + e.id);
            ShowNotifBubble(e.id, 0);
            return;
          case 'cleared':
            this.debug('ALL notifications were removed');
            CleanAllBubbles();
            return;
          case 'added':
            this.debug('added notification for new target');
          case 'updated':
            this.debug('UPDATED notification for existing target');
          }

          this._storeRef.get(e.id).then( count => {
            this.debug('loaded value == ' + count + ' for ID = ' + e.id);
            // trying to workaround bunch removal of notifications e.g. when opening 'Missed calls'
            // screen, which leads to almost simultaneous 'close' of all missed calls notifications
            if (count) {
              ShowNotifBubble(e.id, count);
            }
          }, err => {
            console.warn('[el][PinAppManager] error loading notifications count. err = ' + JSON.stringify(err));
          });
        };
        LoadAllNotifications(store).then( data => {
          Object.getOwnPropertyNames(data).forEach( item => {
            this.debug('INIT: got ' + data[item] + ' for app = ' + item);
            ShowNotifBubble(item, data[item]);
          });
        }, error => {
          console.warn('[el] [PinAppManager] Problem loading previous notifications | err = ' + JSON.stringify(error));
        });

      }, err => {
        console.warn('[el][PinAppManager] Problem opening \'notifications_count\' storage| err = ' + JSON.stringify(err));
      });
    },

    debug: function pa_debug(msg) {
      console.log('[el] ' + msg);
    },

    initStore: function pa_initStore() {
      return new Promise(resolve => {
        if (this._storeRef) {
          return resolve(this._storeRef);
        }
        navigator.getDataStores(this.STORE_NAME).then(stores => {
          this._storeRef = stores[0];
          //TODO: need to iterate through obtained store, to read initial values for notifications.
          return resolve(this._storeRef);
        }, err => {
          this.debug('ERROR '+ JSON.stringify(err));
          return reject(err);
        });
      });
    }
  };

  exports.PinnedAppsManager = PinnedAppsManager;

  function LoadAllNotifications(store) {
    return new Promise( (resolve, reject) => {
      var storedNotifications = {};
      var cursor = store.sync();
      function cursorResolve(task) {
        switch (task.operation) {
          case 'update':
          case 'add':
            console.log('[el] got ADD/UPD task from cursor');
            console.log('[el] ADD/UPD | task ' + JSON.stringify(task));
            storedNotifications[task.id] = task.data;
            break;

          case 'remove':
            console.log('[el] got REMOVE task from cursor');
            delete storedNotifications[task.id];
            break;

          case 'clear':
            console.log('[el] got CLEAR task from cursor');
            storedNotifications = {};
            break;

          case 'done':
            console.log('[el] got DONE task| returning = ' + JSON.stringify(storedNotifications));
            resolve(storedNotifications);
            return;
        }

        cursor.next().then(cursorResolve, reject);
      };
      cursor.next().then(cursorResolve, reject);

    });
  }

  function CleanAllBubbles() {
    app.getPinAppList().forEach( app => {
      ShowNotifBubble(app.manifestURL, 0);
    });
  }

  function ShowNotifBubble(appId,notifCount){

      var els = document.getElementsByTagName('div');
      var i = 0;

      for (i = 0; i < els.length; i++) {
        if (els[i].hasAttribute('data-manifesturl')) {
          if (els[i].getAttribute('data-manifesturl') == appId) {

            var unreadNotif = els[i].getElementsByClassName('unread_notif')[0];

            /* start test part */
//            var notifCountBase = parseInt(unreadNotif.innerHTML || 0);
//            notifCountBase += notifCount;

//            if(notifCountBase > 999){
//              notifCountBase = 0;
//            }
            /* end test part */

            /* uncomment for real life */
             var notifCountBase;
             notifCountBase = parseInt(notifCount);
            /* /uncomment for real life */

            if(notifCountBase > 0 || notifCountBase){
              unreadNotif.style.display = "block";
              unreadNotif.innerHTML = notifCountBase;
            }
            else{
              unreadNotif.style.display = "none";
              unreadNotif.innerHTML = 0;
            }
          }
        }
      }
  };

  window.addEventListener("keydown", function(e) {
    switch (e.keyCode) {
      case 49:
        ShowNotifBubble('app://communications.gaiamobile.org/manifest.webapp',1);
        break;

      case 50:
        ShowNotifBubble('app://sms.gaiamobile.org/manifest.webapp',1);
        break;

       case 51:
        ShowNotifBubble('app://camera.gaiamobile.org/manifest.webapp',1);
        break;

       case 52:
        ShowNotifBubble('app://settings.gaiamobile.org/manifest.webapp',1);
        break;

        default:
          return;
        break;
    }
  });

})(window);
