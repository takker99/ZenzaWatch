import {netUtil} from '../infra/netUtil';
import {CacheStorage} from '../infra/CacheStorage';
import {Emitter} from '../Emitter';
const emitter = new Emitter();
const ZenzaWatch = {emitter};
//===BEGIN===
const MylistApiLoader = (() => {
  // マイリスト/とりあえずマイリストの取得APIには
  // www.nicovideo.jp配下とflapi.nicovideo.jp配下の２種類がある
  // 他人のマイリストを取得するにはflapi、マイリストの編集にはwwwのapiが必要
  // データのフォーマットが微妙に異なるのでめんどくさい
  //
  // おかげでソート処理が悲しいことに
  //
  const CACHE_EXPIRE_TIME = 5 * 60 * 1000;
  const TOKEN_EXPIRE_TIME = 59 * 60 * 1000;
  let cacheStorage = null;
  let token = '';


  if (ZenzaWatch) {
    emitter.on('csrfTokenUpdate', t => {
      token = t;
      if (cacheStorage) {
        cacheStorage.setItem('csrfToken', token, TOKEN_EXPIRE_TIME);
      }
    });
  }

  class MylistApiLoader {
    constructor() {
      if (!cacheStorage) {
        cacheStorage = new CacheStorage(sessionStorage);
      }
      if (!token) {
        token = cacheStorage.getItem('csrfToken');
        if (token) {
          console.log('cached token exists', token);
        }
      }
    }
    setCsrfToken(t) {
      token = t;
      if (cacheStorage) {
        cacheStorage.setItem('csrfToken', token, TOKEN_EXPIRE_TIME);
      }
    }
    async getDeflistItems(options = {}) {
      const url = 'https://www.nicovideo.jp/api/deflist/list';
      const cacheKey = 'deflistItems';
      const sortItem = this.sortItem;

      let cacheData = cacheStorage.getItem(cacheKey);
      if (cacheData) {
        if (options.sort) {
          cacheData = sortItem(cacheData, options.sort, 'www');
        }
        return cacheData;
      }

      const result = await netUtil.fetch(url, {credentials: 'include'}).then(r => r.json())
          .catch(e => { throw new Error('とりあえずマイリストの取得失敗(2)', e); });
      if (result.status !== 'ok' || (!result.list && !result.mylistitem)) {
        throw new Error('とりあえずマイリストの取得失敗(1)', result);
      }

      let data = result.list || result.mylistitem;
      cacheStorage.setItem(cacheKey, data, CACHE_EXPIRE_TIME);
      if (options.sort) {
        data = sortItem(data, options.sort, 'www');
      }
      return data;
    }
    async getMylistItems(groupId, options = {}) {
      if (groupId === 'deflist') {
        return this.getDeflistItems(options);
      }
      // flapiじゃないと自分のマイリストしか取れないことが発覚
      const url = `https://flapi.nicovideo.jp/api/watch/mylistvideo?id=${groupId}`;
      const cacheKey = `mylistItems: ${groupId}`;
      const sortItem = this.sortItem;

      const cacheData = cacheStorage.getItem(cacheKey);
      if (cacheData) {
        return options.sort ? sortItem(cacheData, options.sort, 'flapi') : cacheData;
      }

      const result = await netUtil.fetch(url, {credentials: 'include'})
        .then(r => r.json())
        .catch(e => { throw new Error('マイリストの取得失敗(2)', e); });

      if (result.status !== 'ok' || (!result.list && !result.mylistitem)) {
        throw new Error('マイリストの取得失敗(1)', result);
      }

      let data = result.list || result.mylistitem;
      data.id = groupId;
      cacheStorage.setItem(cacheKey, data, CACHE_EXPIRE_TIME);
      if (options.sort) {
        data = sortItem(data, options.sort, 'flapi');
      }
      return data;
    }
    sortItem(items, sortId, format) {
      // wwwの時とflapiの時で微妙にフォーマットが違うのでめんどくさい
      // 自分以外のマイリストが開けるのはflapiだけの模様
      // 編集時にはitem_idが必要なのだが、それはwwwのほうにしか入ってない
      // flapiに統一したい
      sortId = parseInt(sortId, 10);

      let sortKey = ([
        'create_time', 'create_time',
        'mylist_comment', 'mylist_comment', // format = wwwの時はdescription
        'title', 'title',
        'first_retrieve', 'first_retrieve',
        'view_counter', 'view_counter',
        'thread_update_time', 'thread_update_time',
        'num_res', 'num_res',
        'mylist_counter', 'mylist_counter',
        'length_seconds', 'length_seconds'
      ])[sortId];

      if (format === 'www' && sortKey === 'mylist_comment') {
        sortKey = 'description';
      }
      if (format === 'www' && sortKey === 'thread_update_time') {
        sortKey = 'update_time';
      }

      let order;
      switch (sortKey) {
        // 偶数がascで奇数がdescかと思ったら特に統一されてなかった
        case 'first_retrieve':
        case 'thread_update_time':
        case 'update_time':
          order = (sortId % 2 === 1) ? 'asc' : 'desc';
          break;
        // 数値系は偶数がdesc
        case 'num_res':
        case 'mylist_counter':
        case 'view_counter':
        case 'length_seconds':
          order = (sortId % 2 === 1) ? 'asc' : 'desc';
          break;
        default:
          order = (sortId % 2 === 0) ? 'asc' : 'desc';
      }

      //window.console.log('sortKey?', sortId, sortKey, order);
      if (!sortKey) {
        return items;
      }

      let getKeyFunc = (function (sortKey, format) {
        switch (sortKey) {
          case 'create_time':
          case 'description':
          case 'mylist_comment':
          case 'update_time':
            return item => item[sortKey];
          case 'num_res':
          case 'mylist_counter':
          case 'view_counter':
          case 'length_seconds':
            if (format === 'flapi') {
              return item => item[sortKey] * 1;
            } else {
              return item => item.item_data[sortKey] * 1;
            }
          default:
            if (format === 'flapi') {
              return item => item[sortKey];
            } else {
              return item => item.item_data[sortKey];
            }
        }
      })(sortKey, format);

      let compareFunc = (function (order, getKey) {
        switch (order) {
          // sortKeyが同一だった場合は動画IDでソートする
          // 銀魂など、一部公式チャンネル動画向けの対応
          case 'asc':
            return function (a, b) {
              let ak = getKey(a), bk = getKey(b);
              if (ak !== bk) {
                return ak > bk ? 1 : -1;
              }
              else {
                return a.id > b.id ? 1 : -1;
              }
            };
          case 'desc':
            return function (a, b) {
              let ak = getKey(a), bk = getKey(b);
              if (ak !== bk) {
                return (ak < bk) ? 1 : -1;
              }
              else {
                return a.id < b.id ? 1 : -1;
              }
            };
        }
      })(order, getKeyFunc);

      items.sort(compareFunc);
      return items;
    }
    async getMylistList() {
      const url = 'https://www.nicovideo.jp/api/mylistgroup/list';
      const cacheKey = 'mylistList';

      const cacheData = cacheStorage.getItem(cacheKey);
      if (cacheData) {
        return cacheData;
      }

      const result = await netUtil.fetch(url, {credentials: 'include'})
           .then(r => r.json())
           .catch(e => { throw new Error('マイリスト一覧の取得失敗(2)', e); });
      if (result.status !== 'ok' || !result.mylistgroup) {
        throw new Error(`マイリスト一覧の取得失敗(1) ${result.status}${result.message}`, result);
      }

      const data = result.mylistgroup;
      cacheStorage.setItem(cacheKey, data, CACHE_EXPIRE_TIME);
      return data;
    }
    async findDeflistItemByWatchId(watchId) {
      const items = await this.getDeflistItems().catch(() => []);
      for (let i = 0, len = items.length; i < len; i++) {
        let item = items[i], wid = item.id || item.item_data.watch_id;
        if (wid === watchId) {
          return item;
        }
      }
      return Promise.reject();
    }
    async findMylistItemByWatchId(watchId, groupId) {
      const items = await this._getMylistItemsFromWapi(groupId).catch(() => []);
      for (let i = 0, len = items.length; i < len; i++) {
        let item = items[i], wid = item.id || item.item_data.watch_id;
        if (wid === watchId) {
          return item;
        }
      }
      return Promise.reject();
    }
    async _getMylistItemsFromWapi(groupId) {
      // めんどくさいが、マイリスト取得APIは2種類ある
      // こっちは自分のマイリストだけを取る奴。 編集にはこっちが必要。
      const url = `https://www.nicovideo.jp/api/mylist/list?group_id=${groupId}}`;

      const result = await netUtil.fetch(url, {credentials: 'include'})
        .then(r => r.json())
        .catch(e => { throw new Error('マイリスト取得失敗(2)', e); });
      if (!result || result.status !== 'ok' && !result.mylistitem) {
        window.console.info('getMylistItems fail', result);
        throw new Error('マイリスト取得失敗(1)', result);
      }
      return result.mylistitem;
    }
    async removeDeflistItem(watchId) {
      const item = await this.findDeflistItemByWatchId(watchId).catch(() => {
        throw new Error('動画が見つかりません');
      });
      const url = 'https://www.nicovideo.jp/api/deflist/delete';
      const body = `id_list[0][]=${item.item_id}&token=${token}`;
      const cacheKey = 'deflistItems';
      const req = {
        method: 'POST',
        body,
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        credentials: 'include'
      };

      const result = await netUtil.fetch(url, req)
        .then(r => r.json()).catch(e => e || {});

      if (result && result.status && result.status === 'ok') {
        cacheStorage.removeItem(cacheKey);
        emitter.emitAsync('deflistRemove', watchId);
        return {
          status: 'ok',
          result: result,
          message: 'とりあえずマイリストから削除'
        };
      }

      throw new Error(result.error.description, {
        status: 'fail', result, code: result.error.code
      });
    }
    async removeMylistItem(watchId, groupId) {
      const item = await this.findMylistItemByWatchId(watchId, groupId).catch(result => {
          throw new Error('動画が見つかりません', {result, status: 'fail'});
        });

      const url = 'https://www.nicovideo.jp/api/mylist/delete';
      window.console.log('delete item:', item);
      const body = 'id_list[0][]=' + item.item_id + '&token=' + token + '&group_id=' + groupId;
      const cacheKey = `mylistItems: ${groupId}`;

      const result = await netUtil.fetch(url, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded'},
        credentials: 'include'
      }).then(r => r.json())
        .catch(result => {
          throw new Error('マイリストから削除失敗(2)', {result, status: 'fail'});
        });

      if (result.status && result.status === 'ok') {
        cacheStorage.removeItem(cacheKey);
        emitter.emitAsync('mylistRemove', watchId, groupId);
        return {
          status: 'ok',
          result,
          message: 'マイリストから削除'
        };
      }

      throw new Error(result.error.description, {
        status: 'fail',
        result,
        code: result.error.code
      });
    }
    async _addDeflistItem(watchId, description, isRetry) {
      let url = 'https://www.nicovideo.jp/api/deflist/add';
      let body = `item_id=${watchId}&token=${token}`;
      if (description) {
        body += `&description=${encodeURIComponent(description)}`;
      }
      let cacheKey = 'deflistItems';

      const result = await netUtil.fetch(url, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded'},
        credentials: 'include'
      }).then(r => r.json())
        .catch(err => {
            throw new Error('とりあえずマイリスト登録失敗(200)', {
              status: 'fail',
              result: err
            });
          });
      if (result.status && result.status === 'ok') {
        cacheStorage.removeItem(cacheKey);
        emitter.emitAsync('deflistAdd', watchId, description);
        return {
          status: 'ok',
          result,
          message: 'とりあえずマイリスト登録'
        };
      }

      if (!result.status || !result.error) {
        throw new Error('とりあえずマイリスト登録失敗(100)', {
          status: 'fail',
          result,
        });
      }

      if (result.error.code !== 'EXIST' || isRetry) {
        throw new Error(result.error.description, {
          status: 'fail',
          result,
          code: result.error.code,
          message: result.error.description
        });
      }

      /**
       すでに登録されている場合は、いったん削除して再度追加(先頭に移動)
        例えば、とりマイの300番目に登録済みだった場合に「登録済みです」と言われても探すのがダルいし、
        他の動画を追加していけば、そのうち押し出されて消えてしまう。
        なので、重複時にエラーを出すのではなく、「消してから追加」することによって先頭に持ってくる。
        */
      await self.removeDeflistItem(watchId).catch(err => {
          throw new Error('とりあえずマイリスト登録失敗(101)', {
            status: 'fail',
            result: err.result,
            code: err.code
          });
        });
      const added = await self._addDeflistItem(watchId, description, true);
      return {
        status: 'ok',
        result: added,
        message: 'とりあえずマイリストの先頭に移動'
      };
    }
    addDeflistItem(watchId, description) {
      return this._addDeflistItem(watchId, description, false);
    }
    async addMylistItem(watchId, groupId, description) {
      const url = 'https://www.nicovideo.jp/api/mylist/add';
      let body = 'item_id=' + watchId + '&token=' + token + '&group_id=' + groupId;
      if (description) {
        body += '&description=' + encodeURIComponent(description);
      }
      const cacheKey = `mylistItems: ${groupId}`;

      const result = await netUtil.fetch(url, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded'},
        credentials: 'include'
      }).then(r => r.json())
        .catch(err => {
          throw new Error('マイリスト登録失敗(200)', {
            status: 'fail',
            result: err
          });
        });

      if (result.status && result.status === 'ok') {
        cacheStorage.removeItem(cacheKey);
        // マイリストに登録したらとりあえずマイリストから除去(=移動)
        this.removeDeflistItem(watchId).catch(() => {});
        return {status: 'ok', result, message: 'マイリスト登録'};
      }

      if (!result.status || !result.error) {
        throw new Error('マイリスト登録失敗(100)', {status: 'fail', result});
      }

      // マイリストの場合は重複があっても「追加して削除」しない。
      // とりまいと違って押し出されることがないし、
      // シリーズ物が勝手に入れ替わっても困るため
      emitter.emitAsync('mylistAdd', watchId, groupId, description);
      throw new Error(result.error.description, {
        status: 'fail', result, code: result.error.code
      });
    }
  }

  return new MylistApiLoader();
})();

//===END===

export {MylistApiLoader};