const Stremio = require('stremio-addons');
const imdb = require('imdb');
const torrentStream = require('torrent-stream');
const parseVideo = require('video-name-parser');
const _ = require('lodash');
const PirateBay = require('thepiratebay');
const axios = require('axios');

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


const imdbIdToName = async imdbId => {
	const i = new imdb();
	return await i.getMovie(imdbId);
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
		thumbnail: 'https://lh3.googleusercontent.com/-wTZicECGczgV7jZnLHtnCqVbCn1a3dVll7fp4uAaJOBuF47Lh97yTR_96odCvpzYCn9VsFUKA=w128-h128-e365'
	};

	try{
		const video = await parseVideo(name);
		console.log('video name', video);
		const imdb_id = await nameToImdb(video.name);
		const metaData = await cinemeta(imdb_id);
		meta.banner = _.get(metaData, 'background') || _.get(metaData, 'fanart.showbackground[0].url');
		meta.poster = _.get(metaData, 'background') ||_.get(metaData, 'fanart.showbackground[0].url');
		meta.genre = _.get(metaData, 'genre') || '';
		meta.imdbRating = _.get(metaData, 'imdbRating') || '';
		meta.description = _.get(metaData, 'description') || '';
		meta.thumbnail = _.get(metaData, 'fanart.hdtvlogo[0].url');
		meta.year = _.get(metaData, 'year');
		meta.name = video.name || '';
		return meta;
	} catch(e) {
		console.log(`getMetaDataByName ${e.message}`);
		return meta;
	}
};

const ptbSearch = async query => {
	return await PirateBay.search(query, {
		orderBy: 'seeds',
		sortBy: 'desc',
		category: 'video'
	});
};

module.exports = {
	imdbIdToName,
	torrentStreamEngine,
	getMetaDataByName,
	ptbSearch
};