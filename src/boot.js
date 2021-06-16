import GateAPI from 'loader/GateAPI';
import {AntiPrototypeJs} from '../packages/lib/src/infra/AntiPrototype-js';

//===BEGIN===

const boot = async (monkey, PRODUCT, START_PAGE_QUERY) => {
  if (window.ZenzaWatch) {
    return;
  }
  const document = window.document;
  const host = window.location.host || '';
  const name = window.name || '';
  const href = (location.href || '').replace(/#.*$/, '');
  if (href === 'https://www.nicovideo.jp/robots.txt' &&
    name.startsWith(`nicovideoApi${PRODUCT}Loader`)) {
    GateAPI.nicovideo();
  } else if (host.match(/^smile-.*?\.nicovideo\.jp$/)) {
    GateAPI.smile();
  } else if (host === 'api.search.nicovideo.jp' && name.startsWith(`searchApi${PRODUCT}Loader`)) {
    GateAPI.search();
  } else if (host === 'ext.nicovideo.jp' && name.startsWith(`thumbInfo${PRODUCT}Loader`)) {
    GateAPI.thumbInfo();
  } else if (host === 'ext.nicovideo.jp' && name.startsWith(`videoInfo${PRODUCT}Loader`)) {
    GateAPI.exApi();
  } else if (window === window.top) {
    await AntiPrototypeJs();
    if (window.ZenzaLib) {
      window.ZenzaJQuery = window.ZenzaLib.$;
      const blob = new Blob([
        `(${monkey})('${PRODUCT}', '${encodeURIComponent(START_PAGE_QUERY)}');`
      ], {type: 'text/javascript'});
      const src = URL.createObjectURL(blob);
      const handler = () => {
        URL.revokeObjectURL(src);
        script.remove();
      };
      const script = Object.assign(document.createElement('script'), {
        id: `${PRODUCT}Loader`,
        type: 'text/javascript',
        src,
        onload: handler,
        onerror: handler
      });
      // script.append(
      //   `(${monkey})('${PRODUCT}', '${encodeURIComponent(START_PAGE_QUERY)}');`);
      document.head.append(script);
    }
//@require ../packages/lib/src/nico/modernLazyload.js
  }
};


//===END===


export {boot};
