import onChange from 'on-change';
import * as yup from 'yup';
import resources from '../locales/index.js';
import i18nextInstance from './i18n.js';
import parseRss from './rss-parser.js';
import { prepareFeed, parseRssResponse } from './utils.js';
import getFeed from './service.js';
import {
  getDomNodesRefs,
  render,
} from './render.js';
import { TIMEOUT } from './constants.js';

const initState = () => ({
  feedsUrls: [],
  feedSources: [],
  feedItems: [],
  lang: 'ru',
  feedUrlUploadState: 'none', // none, filling, sending, finished, failed
  inputMessage: '',
  visitedPosts: [],
  timers: [],
  modalData: { title: '', description: '', link: '' },
});

export default () => {
  i18nextInstance.init({
    lng: 'ru',
    resources: {
      ru: resources.ru,
      en: resources.en,
    },
  }).then(() => {
    const domElements = getDomNodesRefs();
    const {
      modal,
      feedInputLabel,
      formSubmitButton,
      exampleBlock,
      feedsHeader,
      postsHeader,
      closeModalButton,
      feedForm,
      postsList,
    } = domElements;

    feedInputLabel.innerHTML = i18nextInstance.t('INPUT_LABEL');
    formSubmitButton.innerHTML = i18nextInstance.t('SUBMIT');
    exampleBlock.innerHTML = `${i18nextInstance.t('EXAMPLE')}https://ru.hexlet.io/lessons.rss`;
    feedsHeader.innerHTML = i18nextInstance.t('FEEDS');
    postsHeader.innerHTML = i18nextInstance.t('POSTS');
    closeModalButton.innerHTML = i18nextInstance.t('CLOSE');

    const state = initState();

    const watchedState = onChange(state, render(domElements, i18nextInstance));

    const setFeedsUrls = (value) => { watchedState.feedsUrls = value; };
    const setFeedSources = (value) => { watchedState.feedSources = value; };
    const setFeedItems = (value) => { watchedState.feedItems = value; };
    const setModalData = (value) => { watchedState.modalData = value; };
    const setFeedUrlUploadState = (value) => { watchedState.feedUrlUploadState = value; };
    const setInputMessage = (value) => { watchedState.inputMessage = value; };
    const setVisitedPosts = (value) => { watchedState.visitedPosts = value; };

    const pushNewFeedItems = (feedItems) => {
      const newFeedItems = {};
      Object.entries(feedItems).forEach(([key, value]) => {
        if (!state.feedItems[key]) {
          newFeedItems[key] = value;
        }
      });

      setFeedItems({ ...state.feedItems, ...newFeedItems });
    };

    const refreshFeeds = () => {
      const refreshRequests = state.feedsUrls.map((item) => getFeed(item)
        .then((response) => parseRssResponse(response)));

      Promise.all(refreshRequests).then((feeds) => {
        feeds.forEach((feed) => {
          const rawData = parseRss(feed);
          const preparedFeed = prepareFeed(rawData);
          const feedItems = preparedFeed
            .items.reduce((acc, item) => ({ ...acc, [item.title]: item }), {});
          pushNewFeedItems(feedItems);
        });

        setTimeout(() => {
          refreshFeeds();
        }, TIMEOUT);
      });
    };

    refreshFeeds();

    const initModal = () => {
      modal.addEventListener('show.bs.modal', (event) => {
        const button = event.relatedTarget;
        const id = button.getAttribute('data-id');
        const post = state.feedItems[id];
        post.isRead = true;
        setFeedItems({ ...state.feedItems, [id]: post });
        setModalData({ title: post.title, description: post.description, link: post.link });
      });
    };

    initModal();

    const validate = (urls) => yup.object().shape({
      inputValue: yup.string()
        .url('URL_VALIDATION_ERROR')
        .test('value-duplicate', 'VALUE_DUPLICATE_ERROR', (value) => urls.every((source) => value !== source))
        .required('REQUIRED_VALIDATION_ERROR'),
    });

    feedForm.addEventListener('submit', (event) => {
      const formData = new FormData(event.target);
      const url = formData.get('feedValue');
      event.preventDefault();
      validate(watchedState.feedsUrls).validate({ inputValue: url }).then(() => {
        setFeedUrlUploadState('sending');

        return Promise.all([
          Promise.resolve(url),
          getFeed(url).then((response) => parseRssResponse(response))]);
      }).then(([feedUrl, content]) => {
        const rawData = parseRss(content);
        const feeds = prepareFeed(rawData);

        setFeedItems({
          ...state.feedItems,
          ...feeds.items.reduce((acc, item) => ({ ...acc, [item.title]: item }), {}),
        });

        if (!state.feedSources[feeds.feed.id]) {
          setFeedSources({
            ...state.feedSources,
            [feeds.feed.id]: feeds.feed,
          });
        }

        if (!state.feedsUrls.includes(feedUrl)) {
          setFeedsUrls([...state.feedsUrls, feedUrl]);
        }

        setFeedUrlUploadState('finished');
        setInputMessage('SUCCESS');
      })
        .then(() => {
        })
        .catch((err) => {
          if (err.code === 'ERR_NETWORK') {
            setInputMessage(err.code);
          } else {
            setInputMessage(err.message);
          }

          setFeedUrlUploadState('failed');
        });
    });

    postsList.addEventListener('click', (event) => {
      if (event.target.tagName === 'A') {
        setVisitedPosts([event.target.id, ...watchedState.visitedPosts]);
      }
    });
  });
};
