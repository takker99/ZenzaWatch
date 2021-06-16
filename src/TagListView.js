import {ZenzaWatch} from './ZenzaWatchIndex';
import {BaseViewComponent} from '../packages/zenza/src/parts/BaseViewComponent';
import {TagEditApi} from '../packages/lib/src/nico/TagEditApi';
import {Config} from './Config';
import {textUtil} from '../packages/lib/src/text/textUtil';
import {nicoUtil} from '../packages/lib/src/nico/nicoUtil';

//===BEGIN===

class TagListView extends BaseViewComponent {
  constructor({parentNode}) {
    super({
      parentNode,
      name: 'TagListView',
      template: '<div class="TagListView"></div>',
      shadow: TagListView.__shadow__,
      css: TagListView.__css__
    });

    this._state = {
      isInputing: false,
      isUpdating: false,
      isEditing: false
    };

    this._tagEditApi = new TagEditApi();
  }

  _initDom(...args) {
    super._initDom(...args);

    const v = this._shadow || this._view;
    Object.assign(this._elm, {
      videoTags: v.querySelector('.videoTags'),
      videoTagsInner: v.querySelector('.videoTagsInner'),
      tagInput: v.querySelector('.tagInputText'),
      form: v.querySelector('form')
    });

    this._elm.tagInput.addEventListener('keydown', this._onTagInputKeyDown.bind(this));
    this._elm.form.addEventListener('submit', this._onTagInputSubmit.bind(this));
    v.addEventListener('keydown', e => {
      if (this._state.isInputing) {
        e.stopPropagation();
      }
    });
    v.addEventListener('click', e => e.stopPropagation());

    ZenzaWatch.emitter.on('hideHover', () => {
      if (this._state.isEditing) {
        this._endEdit();
      }
    });
  }

  _onCommand(command, param) {
    switch (command) {

      case 'refresh':
        this._refreshTag();
        break;
      case 'toggleEdit':
        if (this._state.isEditing) {
          this._endEdit();
        } else {
          this._beginEdit();
        }
        break;
      case 'toggleInput':
        if (this._state.isInputing) {
          this._endInput();
        } else {
          this._beginInput();
        }
        break;
      case 'beginInput':
        this._beginInput();
        break;
      case 'endInput':
        this._endInput();
        break;
      case 'addTag':
        this._addTag(param);
        break;
      case 'removeTag': {
        let elm = this._elm.videoTags.querySelector(`.tagItem[data-tag-id="${param}"]`);
        if (!elm) {
          return;
        }
        elm.classList.add('is-Removing');
        let data = JSON.parse(elm.getAttribute('data-tag'));
        this._removeTag(param, data.name);
        break;
      }
      case 'tag-search':
        this._onTagSearch(param);
        break;
      case 'none':
        break;
      default:
        super._onCommand(command, param);
        break;
    }
  }

  _onTagSearch(word) {
    const config = Config.namespace('videoSearch');

    let option = {
      searchType: config.getValue('mode'),
      order: config.getValue('order'),
      sort: config.getValue('sort') || 'playlist',
      owner: config.getValue('ownerOnly')
    };

    if (option.sort === 'playlist') {
      option.sort = 'f';
      option.playlistSort = true;
    }

    super._onCommand('playlistSetSearchVideo', {word, option});
  }

  update({tagList = [], watchId = null, videoId = null, token = null, watchAuthKey = null}) {
    if (watchId) {
      this._watchId = watchId;
    }
    if (videoId) {
      this._videoId = videoId;
    }
    if (token) {
      this._token = token;
    }
    if (watchAuthKey) {
      this._watchAuthKey = watchAuthKey;
    }

    this.setState({
      isInputing: false,
      isUpdating: false,
      isEditing: false,
      isEmpty: false
    });
    this._update(tagList);

    this._boundOnBodyClick = this._onBodyClick.bind(this);
  }

  _onClick(e) {
    if (this._state.isInputing || this._state.isEditing) {
      e.stopPropagation();
    }
    super._onClick(e);
  }

  _update(tagList = []) {
    let tags = [];
    tagList.forEach(tag => {
      tags.push(this._createTag(tag));
    });
    if (nicoUtil.isLogin()) {
      tags.push(this._createToggleInput());
    } else {
      tags.push(`<span class="text">ログインしていません</span>`);
    }
    this.setState({isEmpty: tagList.length < 1});
    this._elm.videoTagsInner.innerHTML = tags.join('');
  }

  _createToggleInput() {
    return (`
        <div
          class="button command toggleInput"
          data-command="toggleInput"
          data-tooltip="タグ追加">
          <span class="icon">&#8853;</span>
        </div>`).trim();
  }

  _onApiResult(watchId, result) {
    if (watchId !== this._watchId) {
      return; // 通信してる間に動画変わったぽい
    }
    const err = result.error_msg;
    if (err) {
      this.emit('command', 'alert', err);
    }

    this.update(result.tags);
  }

  _addTag(tag) {
    this.setState({isUpdating: true});

    const wait3s = this._makeWait(3000);
    const watchId = this._watchId;
    const videoId = this._videoId;
    const csrfToken = this._token;
    const watchAuthKey = this._watchAuthKey;
    const addTag = () => {
      return this._tagEditApi.add({
        videoId,
        tag,
        csrfToken,
        watchAuthKey
      });
    };

    return Promise.all([addTag(), wait3s]).then(results => {
      let result = results[0];
      if (watchId !== this._watchId) {
        return;
      } // 待ってる間に動画が変わったぽい
      if (result && result.tags) {
        this._update(result.tags);
      }
      this.setState({isInputing: false, isUpdating: false, isEditing: false});

      if (result.error_msg) {
        this.emit('command', 'alert', result.error_msg);
      }
    });
  }

  _removeTag(tagId, tag = '') {
    this.setState({isUpdating: true});

    const wait3s = this._makeWait(3000);
    const watchId = this._watchId;
    const videoId = this._videoId;
    const csrfToken = this._token;
    const watchAuthKey = this._watchAuthKey;
    const removeTag = () => {
      return this._tagEditApi.remove({
        videoId,
        tag,
        id: tagId,
        csrfToken,
        watchAuthKey
      });
    };

    return Promise.all([removeTag(), wait3s]).then((results) => {
      let result = results[0];
      if (watchId !== this._watchId) {
        return;
      } // 待ってる間に動画が変わったぽい
      if (result && result.tags) {
        this._update(result.tags);
      }
      this.setState({isUpdating: false});

      if (result.error_msg) {
        this.emit('command', 'alert', result.error_msg);
      }
    });
  }

  _refreshTag() {
    this.setState({isUpdating: true});
    const watchId = this._watchId;
    const wait1s = this._makeWait(1000);
    const load = () => {
      return this._tagEditApi.load(this._videoId);
    };

    return Promise.all([load(), wait1s]).then((results) => {
      let result = results[0];
      if (watchId !== this._watchId) {
        return;
      } // 待ってる間に動画が変わったぽい
      this._update(result.tags);
      this.setState({isUpdating: false, isInputing: false, isEditing: false});
    });
  }

  _makeWait(ms) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(ms);
      }, ms);
    });
  }

  _createDicIcon(text, hasDic) {
    let href = `https://dic.nicovideo.jp/a/${encodeURIComponent(text)}`;
    // TODO: 本家がHTML5に完全移行したらこのアイコンも消えるかもしれないので代替を探す
    let src = hasDic ?
      'https://live.nicovideo.jp/img/2012/watch/tag_icon002.png' :
      'https://live.nicovideo.jp/img/2012/watch/tag_icon003.png' ;
    let icon = `<img class="dicIcon" src="${src}">`;
    
    let hasNicodic = hasDic ? 1 : 0;
    return (
      `<zenza-tag-item-menu
        class="tagItemMenu"
        data-text="${encodeURIComponent(text)}"
        data-has-nicodic="${hasNicodic}"
      ><a target="_blank" class="nicodic" href="${href}">${icon}</a></zenza-tag-item-menu>`
    );
  }

  _createDeleteButton(id) {
  
    let deletTag = '';
    if(nicoUtil.isLogin()){
      deletTag = `<span target="_blank" class="deleteButton command" title="削除" data-command="removeTag" data-param="${id}">－</span>`;
    }else{
      deletTag = `<span target="_blank" class="deleteButton command" title="ログインしてください" data-command="none" data-param="${id}">×</span>`;
    }
    return deletTag;
  }

  _createLink(text) {
    let href = `//www.nicovideo.jp/tag/${encodeURIComponent(text)}`;
    // タグはエスケープされた物が来るのでそのままでつっこんでいいはずだが、
    // 古いのはけっこういい加減なデータもあったりして信頼できない        
    text = textUtil.escapeToZenkaku(textUtil.unescapeHtml(text));
    return `<a class="tagLink" href="${href}">${text}</a>`;
  }

  _createSearch(text) {
    let title = 'プレイリストに追加';
    let command = 'tag-search';
    let param = textUtil.escapeHtml(text);
    return (`<zenza-playlist-append class="playlistAppend" title="${title}" data-command="${command}" data-param="${param}">▶</zenza-playlist-append>`);
  }

  _createTag(tag) {
    let tagName = tag.name;
    let dic = this._createDicIcon(tagName, !!tag.isNicodicArticleExists);
    let del = this._createDeleteButton(tagName);
    let link = this._createLink(tagName);
    let search = this._createSearch(tagName);
    let data = textUtil.escapeHtml(JSON.stringify(tag));
    // APIごとに形式が統一されてなくてひどい
    let className = (tag.isLocked || tag.isLockedBySystem === 1 || tag.lck === '1')  ? 'tagItem is-Locked' : 'tagItem';
    
    return `<li class="${className}" data-tag="${data}" data-tag-id="${tagName}">${dic}${del}${link}${search}</li>`;
  
  
  /*
    let text = tag.tag;
    let dic = this._createDicIcon(text, !!tag.dic);
    let del = this._createDeleteButton(tag.tag);
    let link = this._createLink(text);
    let search = this._createSearch(text);
    let data = textUtil.escapeHtml(JSON.stringify(tag));
    // APIごとに形式が統一されてなくてひどい
    let className = (tag.lock || tag.owner_lock === 1 || tag.lck === '1') ? 'tagItem is-Locked' : 'tagItem';
    className = (tag.cat) ? `${className} is-Category` : className;
    return `<li class="${className}" data-tag="${data}" data-tag-id="${tag.tag}">${dic}${del}${link}${search}</li>`;
*/
  }

  _onTagInputKeyDown(e) {
    if (this._state.isUpdating) {
      e.preventDefault();
      e.stopPropagation();
    }
    switch (e.keyCode) {
      case 27: // ESC
        e.preventDefault();
        e.stopPropagation();
        this._endInput();
        break;
    }
  }

  _onTagInputSubmit(e) {
    if (this._state.isUpdating) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    let val = (this._elm.tagInput.value || '').trim();
    if (!val) {
      this._endInput();
      return;
    }
    this._onCommand('addTag', val);
    this._elm.tagInput.value = '';
  }

  _onBodyClick() {
    this._endInput();
    this._endEdit();
  }

  _beginEdit() {
    this.setState({isEditing: true});
    document.body.addEventListener('click', this._boundOnBodyClick);
  }

  _endEdit() {
    document.body.removeEventListener('click', this._boundOnBodyClick);
    this.setState({isEditing: false});
  }

  _beginInput() {
    this.setState({isInputing: true});
    document.body.addEventListener('click', this._boundOnBodyClick);
    this._elm.tagInput.value = '';
    window.setTimeout(() => {
      this._elm.tagInput.focus();
    }, 100);
  }

  _endInput() {
    this._elm.tagInput.blur();
    document.body.removeEventListener('click', this._boundOnBodyClick);
    this.setState({isInputing: false});
  }


}


TagListView.__shadow__ = (`
    <style>
      :host-context(.videoTagsContainer.sideTab) .tagLink {
        color: #000 !important;
        text-decoration: none;
      }

      .TagListView {
        position: relative;
        user-select: none;
      }

      .TagListView.is-Updating {
        cursor: wait;
      }

      :host-context(.videoTagsContainer.sideTab) .TagListView.is-Updating {
        overflow: hidden;
      }

      .TagListView.is-Updating:after {
        content: '${'\\0023F3'}';
        position: absolute;
        top: 50%;
        left: 50%;
        text-align: center;
        transform: translate(-50%, -50%);
        z-index: 10001;
        color: #fe9;
        font-size: 24px;
        letter-spacing: 3px;
        text-shadow: 0 0 4px #000;
        pointer-events: none;
      }

      .TagListView.is-Updating:before {
        content: ' ';
        background: rgba(0, 0, 0, 0.6);
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 100%;
        height: 100%;
        padding: 8px;
        z-index: 10000;
        box-shadow: 0 0 8px #000;
        border-radius: 8px;
        pointer-events: none;
      }

      .TagListView.is-Updating * {
        pointer-events: none;
      }

      *[data-tooltip] {
        position: relative;
      }

      .TagListView .button {
        position: relative;
        display: inline-block;
        min-width: 40px;
        min-height: 24px;
        cursor: pointer;
        user-select: none;
        transition: 0.2s transform, 0.2s box-shadow, 0.2s background;
        text-align: center;
      }

      .TagListView .button:hover {
        background: #666;
      }

      .TagListView .button:active {
        transition: none;
        box-shadow: 0 0 2px #000 inset;
      }
      .TagListView .button .icon {
        position: absolute;
        display: inline-block;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
      }

      .TagListView *[data-tooltip]:hover:after {
        content: attr(data-tooltip);
        position: absolute;
        left: 50%;
        bottom: 100%;
        transform: translate(-50%, 0) scale(0.9);
        pointer-events: none;
        background: rgba(192, 192, 192, 0.9);
        box-shadow: 0 0 4px #000;
        color: black;
        font-size: 12px;
        margin: 0;
        padding: 2px 4px;
        white-space: nowrap;
        z-index: 10000;
        letter-spacing: 2px;
      }

      .videoTags {
        display: inline-block;
        padding: 0;
      }

      .videoTagsInner {
        display: flex;
        flex-wrap: wrap;
        padding: 0 8px;
      }

      .TagListView .tagItem {
        position: relative;
        list-style-type: none;
        display: inline-flex;
        margin-right: 2px;
        line-height: 20px;
        max-width: 50vw;
        align-items: center;
      }

      .TagListView .tagItem:first-child {
        margin-left: 100px;
      }

      .tagLink {
        color: #fff;
        text-decoration: none;
        user-select: none;
        display: inline-block;
        border: 1px solid rgba(0, 0, 0, 0);
      }

      .TagListView .nicodic {
        display: inline-block;
        margin-right: 4px;
        line-height: 20px;
        cursor: pointer;
        vertical-align: middle;
      }

      .TagListView.is-Editing .tagItemMenu,
      .TagListView.is-Editing .nicodic,
      .TagListView:not(.is-Editing) .deleteButton {
        display: none !important;
      }

      .TagListView .deleteButton {
        display: inline-block;
        margin: 0px;
        line-height: 20px;
        width: 20px;
        height: 20px;
        font-size: 16px;
        background: #f66;
        color: #fff;
        cursor: pointer;
        border-radius: 100%;
        transition: transform 0.2s, background 0.4s;
        text-shadow: none;
        transform: scale(1.2);
        text-align: center;
        opacity: 0.8;
      }

      .TagListView.is-Editing .deleteButton:hover {
        transform: rotate(0) scale(1.2);
        background: #f00;
        opacity: 1;
      }

      .TagListView.is-Editing .deleteButton:active {
        transform: rotate(360deg) scale(1.2);
        transition: none;
        background: #888;
      }

      .TagListView.is-Editing .is-Locked .deleteButton {
        visibility: hidden;
      }
      
      .TagListView .is-Removing .deleteButton {
        background: #666;
      }

      .tagItem .playlistAppend {
        display: inline-block;
        position: relative;
        left: auto;
        bottom: auto;
      }

      .TagListView .tagItem .playlistAppend {
        display: inline-block;
        font-size: 16px;
        line-height: 24px;
        width: 24px;
        height: 24px;
        bottom: 4px;
        background: #666;
        color: #ccc;
        text-decoration: none;
        border: 1px outset;
        cursor: pointer;
        text-align: center;
        user-select: none;
        visibility: hidden;
        margin-right: -2px;
      }

      .tagItem:hover .playlistAppend {
        visibility: visible;
      }

      .tagItem:hover .playlistAppend:hover {
        transform: scale(1.5);
      }

      .tagItem:hover .playlistAppend:active {
        transform: scale(1.4);
      }

      .tagItem.is-Removing {
        transform-origin: right !important;
        transform: translate(0, 150vh) !important;
        opacity: 0 !important;
        max-width: 0 !important;
        transition:
          transform 2s ease 0.2s,
          opacity 1.5s linear 0.2s,
          max-width 0.5s ease 1.5s
        !important;
        pointer-events: none;
        overflow: hidden !important;
        white-space: nowrap;
      }

      .is-Editing .playlistAppend {
        visibility: hidden !important;
      }

      .is-Editing .tagLink {
        pointer-events: none;
      }
      .is-Editing .dicIcon {
        display: none;
      }

      .tagItem:not(.is-Locked) {
        transition: transform 0.2s, text-shadow 0.2s;
      }

      .is-Editing .tagItem.is-Locked {
        position: relative;
        cursor: not-allowed;
      }

      .is-Editing .tagItem.is-Locked *{
        pointer-events: none;
      }

      .is-Editing .tagItem.is-Locked:hover:after {
        content: '${'\\01F6AB'} ロックタグ';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: #ff9;
        white-space: nowrap;
        background: rgba(0, 0, 0, 0.6);
      }

      .is-Editing .tagItem:nth-child(11).is-Locked:hover:after {
        content: '${'\\01F6AB'} ロックマン';
      }

      .is-Editing .tagItem:not(.is-Locked) {
        text-shadow: 0 4px 4px rgba(0, 0, 0, 0.8);
      }

      .is-Editing .tagItem.is-Category * {
        color: #ff9;
      }
      .is-Editing .tagItem.is-Category.is-Locked:hover:after {
        content: '${'\\01F6AB'} カテゴリタグ';
      }


      .tagInputContainer {
        display: none;
        padding: 4px 8px;
        background: #666;
        z-index: 5000;
        box-shadow: 4px 4px 4px rgba(0, 0, 0, 0.8);
        font-size: 16px;
      }

      :host-context(.videoTagsContainer.sideTab)     .tagInputContainer {
        position: absolute;
        background: #999;
      }

      .tagInputContainer .tagInputText {
        width: 200px;
        font-size: 20px;
      }

      .tagInputContainer .submit {
        font-size: 20px;
      }

      .is-Inputing .tagInputContainer {
        display: inline-block;
      }

      .is-Updating .tagInputContainer {
        pointer-events: none;
      }

        .tagInput {
          border: 1px solid;
        }

        .tagInput:active {
          box-shadow: 0 0 4px #fe9;
        }

        .submit, .cancel {
          background: #666;
          color: #ccc;
          cursor: pointer;
          border: 1px solid;
          text-align: center;
        }

      .TagListView .tagEditContainer {
        position: absolute;
        left: 0;
        top: 0;
        z-index: 1000;
        display: inline-block;
      }

      .TagListView.is-Empty .tagEditContainer {
        position: relative;
      }

      .TagListView:hover .tagEditContainer {
        display: inline-block;
      }

      .TagListView.is-Updating .tagEditContainer * {
        pointer-events: none;
      }

      .TagListView .tagEditContainer .button,
      .TagListView .videoTags .button {
        border-radius: 16px;
        font-size: 24px;
        line-height: 24px;
        margin: 0;
      }

      .TagListView.is-Editing .button.toggleEdit,
      .TagListView .button.toggleEdit:hover {
        background: #c66;
      }

      .TagListView .button.tagRefresh .icon {
        transform: translate(-50%, -50%) rotate(90deg);
        transition: transform 0.2s ease;
        font-family: STIXGeneral;
      }

      .TagListView .button.tagRefresh:active .icon {
        transform: translate(-50%, -50%) rotate(-330deg);
        transition: none;
      }

      .TagListView.is-Inputing .button.toggleInput {
        display: none;
      }

      .TagListView  .button.toggleInput:hover {
        background: #66c;
      }

      .tagEditContainer form {
        display: inline;
      }

    </style>
    <div class="root TagListView">
      <div class="tagEditContainer">
        <div
          class="button command toggleEdit"
          data-command="toggleEdit"
          data-tooltip="タグ編集">
          <span class="icon">&#9999;</span>
        </div>

        <div class="button command tagRefresh"
          data-command="refresh"
          data-tooltip="リロード">
          <span class="icon">&#8635;</span>
        </div>
      </div>

      <div class="videoTags">
        <span class="videoTagsInner"></span>
        <div class="tagInputContainer">
          <form action="javascript: void">
            <input type="text" name="tagText" class="tagInputText">
            <button class="submit button">O K</button>
          </form>
        </div>
      </div>
    </div>
  `).trim();

TagListView.__css__ = (`

    /* Firefox用 ShaowDOMサポートしたら不要 */
    .videoTagsContainer.sideTab .is-Updating {
      overflow: hidden;
    }
    .videoTagsContainer.sideTab a {
      color: #000 !important;
      text-decoration: none !important;
    }
    .videoTagsContainer.videoHeader a {
      color: #fff !important;
      text-decoration: none !important;
    }
    .videoTagsContainer.sideTab .tagInputContainer {
      position: absolute;
    }

  `).trim();


class TagItemMenu extends HTMLElement {
  static template({text}) {
    let host = location.host;
    return `
      <style>
        .root {
          display: inline-block;
          --icon-size: 16px;
          margin-right: 4px;
          outline: none;
        }

        .icon {
          position: relative;
          display: inline-block;
          vertical-align: middle;
          box-sizing: border-box;
          width: var(--icon-size);
          height: var(--icon-size);
          margin: 0;
          padding: 0;
          font-size: var(--icon-size);
          line-height: calc(var(--icon-size));
          text-align: center;
          cursor: pointer;
        }

        .nicodic, .toggle {
          background: #888;
          color: #ccc;
          box-shadow: 0.1em 0.1em 0 #333;
        }
        .has-nicodic .nicodic,.has-nicodic .toggle {
          background: #900;
        }
        .toggle::after {
          content: '？';
          position: absolute;
          width: var(--icon-size);
          left: 0;
          font-size: 0.8em;
          font-weight: bolder;
        }

        .menu {
          display: none;
          position: fixed;
          background-clip: content-box;
          border-style: solid;
          border-width: 16px 0 16px 0;
          border-color: transparent;
          padding: 0;
          z-index: 100;
          transform: translateY(-30px);
        }

        :host-context(.zenzaWatchVideoInfoPanelFoot) .menu {
          position: absolute;
          bottom: 0;
          transform: translateY(8x);
        }

        .root .menu:hover,
        .root:focus-within .menu {
          display: inline-block;
        }

        li {
          list-style-type: none;
          padding: 2px 8px 2px 20px;
          background: rgba(80, 80, 80, 0.95);
        }

        li a {
          display: inline-block;
          white-space: nowrap;
          text-decoration: none;
          color: #ccc;
        }

        li a:hover {
          text-decoration: underline;
        }

      </style>
      <div class="root" tabindex="-1">
        <div class="icon toggle"></div>
        <ul class="menu">

          <li>
            <a href="//dic.nicovideo.jp/a/${text}"
              ${host !== 'dic.nicovideo.jp' ? 'target="_blank"' : ''}>
              大百科を見る
            </a>
          </li>
          <li>
            <a href="//ch.nicovideo.jp/search/${text}?type=video&mode=t"
              ${host !== 'ch.nicovideo.jp' ? 'target="_blank"' : ''}>
              チャンネル検索
            </a>
          </li>
          <li>
            <a href="https://www.google.co.jp/search?q=${text}%20site:www.nicovideo.jp&num=100&tbm=vid"
              ${host !== 'www.google.co.jp' ? 'target="_blank"' : ''}>
              Googleで検索
            </a>
          </li>
          <li>
            <a href="https://www.bing.com/videos/search?q=${text}%20site:www.nicovideo.jp&qft=+filterui:msite-nicovideo.jp"
              ${host !== 'www.bing.com' ? 'target="_blank"' : ''}>Bingで検索
            </a>
          </li>
          <li>
            <a href="https://www.google.co.jp/search?q=${text}%20site:www.nicovideo.jp/series&num=100"
              ${host !== 'www.google.co.jp' ? 'target="_blank"' : ''}>
              シリーズ検索
            </a>
          </li>
        </ul>
      </div>
    `;
  }
  constructor() {
    super();
    this.hasNicodic = parseInt(this.dataset.hasNicodic) !== 0;
    this.text = textUtil.escapeToZenkaku(this.dataset.text);
    const shadow = this._shadow = this.attachShadow({mode: 'open'});
    shadow.innerHTML = this.constructor.template({text: this.text});
    shadow.querySelector('.root').classList.toggle('has-nicodic', this.hasNicodic);
  }
}
if (window.customElements) {
  window.customElements.define('zenza-tag-item-menu', TagItemMenu);
}

//===END===

export {TagListView};
