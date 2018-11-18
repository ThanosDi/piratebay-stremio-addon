const Stremio = require('stremio-addons');
const imdb = require('imdb');
const torrentStream = require('torrent-stream');
const parseVideo = require('video-name-parser');
const _ = require('lodash');
const PirateBay = require('thepiratebay');
const { isEmpty, not, pipe, pathOr } = require('ramda');
const ONE_DAY = 86400;
let cache;

const initMongo = async db => {
	await db.get('cache').ensureIndex({ createdAt: 1, id: 1 }, { expireAfterSeconds: ONE_DAY });
	cache = await db.get('cache')
};

const nameToImdb = name => {
	return new Promise((resolve, rejected) => {
		const nameToImdb = require("name-to-imdb");
		nameToImdb({ name }, function(err, res, inf) {
			if(err){
				rejected( new Error(err.message));
			}
			resolve(res);
		});
	});
};

const cinemeta = imdb_id => {
	const client = new Stremio.Client();
	client.add('http://cinemeta.strem.io/stremioget/stremio/v1');

	return new Promise((resolve, rejected) => {
		client.meta.get({ query: { imdb_id } }, function(err, meta) {
			if(err){
				rejected( new Error(err.message));
			}
			resolve(meta);
		});
	});
};

const imdbIdToName = imdbId => {
	return new Promise(function (resolve, reject) {
		imdb(imdbId, function(err, data) {
			if(err){
				reject( new Error(err.message));
			}
			resolve(data);
		});
	});
};

const torrentStreamEngine = magnetLink => {
	return new Promise(function (resolve, reject) {
		const engine = new torrentStream(magnetLink, {
			connections: 30
		});
		engine.ready(() => {
			resolve(engine);
		});
	});
};

const getMetaDataByName = async name => {
	const meta = {
		name:'',
		poster: '',
		banner: '',
		genre: '',
		imdbRating: 0,
		description: '',
		year: 2018,
		overview: '',
		thumbnail: 'https://lh3.googleusercontent.com/-wTZicECGczgV7jZnLHtnCqVbCn1a3dVll7fp4uAaJOBuF47Lh97yTR_96odCvpzYCn9VsFUKA=w128-h128-e365'
	};

	try{
		const video = await parseVideo(name);
		const imdb_id = await nameToImdb(video.name);
		const metaData = await cinemeta(imdb_id);

		meta.banner = _.get(metaData, 'background') || _.get(metaData, 'fanart.showbackground[0].url');
		meta.poster = _.get(metaData, 'background') ||_.get(metaData, 'fanart.showbackground[0].url');
		meta.genre = _.get(metaData, 'genre') || '';
		meta.imdbRating = _.get(metaData, 'imdbRating') || '';
		meta.description = _.get(metaData, 'description') || '';
		meta.overview = _.get(metaData, 'description') || '';
		meta.thumbnail = _.get(metaData, 'logo') || meta.thumbnail;
		meta.year = _.get(metaData, 'year');
		meta.name = video.name || '';
		return meta;
	} catch(e) {
		return meta;
	}
};

const isFull = pipe(
	pathOr([], ['results']),
	isEmpty,
	not
);

const ptbSearch = async query => {
	const cachedResults = await cache.findOne({id: query}, { 'fields': { '_id': 0, 'results': 1  }});

	if (isFull(cachedResults)) return pathOr([], ['results'], cachedResults);
	const ptbResults = await PirateBay.search(query, {
		orderBy: 'seeds',
		sortBy: 'desc',
		category: 'video',
		proxyList: ['https://thepiratebay.rocks', 'https://pirateproxy.gdn', 'https://pirateproxy.live', 'https://thehiddenbay.com']
	});

	const results = await cache.findOneAndUpdate(
		{id: query},
		{id: query,
			createdAt: new Date(),
			results: pathOr([], ['results'], ptbResults).slice(0, 4)},
		{returnNewDocument: true, upsert: true}
		);

	return pathOr([], ['results'], results);
};

module.exports = {
	imdbIdToName,
	torrentStreamEngine,
	getMetaDataByName,
	ptbSearch,
	initMongo
};