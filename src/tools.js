const Stremio = require('stremio-addons');
const imdb = require('imdb');
const toImdb = require("name-to-imdb");
const torrentStream = require('torrent-stream');
const parseVideo = require('video-name-parser');
const tnp = require("torrent-name-parser");
const _ = require('lodash');
const PirateBay = require('thepiratebay');

const nameToImdbId = name => {
	return new Promise((resolve, rejected) => {
		toImdb({ name }, function(err, res, inf) {
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
	try{
		const nameParsed = tnp(name).title;
		const imdb_id = await nameToImdbId(nameParsed);
		const metaData = await cinemeta(imdb_id);
		if (!metaData) {
			return;
		}
		//console.log('meta',  metaData);
		
		return {
			name: nameParsed || name,
			type: _.get(metaData, 'type') || 'movie',
			imdbRating: _.get(metaData, 'imdbRating'),
			year: _.get(metaData, 'year'),
			genre: _.get(metaData, 'genre'),
			description: _.get(metaData, 'description'),
			overview: _.get(metaData, 'description'),
			cast: _.get(metaData, 'cast'),
			director: _.get(metaData, 'director') || _.get(metaData, 'writer'),
			runtime: _.get(metaData, 'runtime'),
			released: _.get(metaData, 'released'),
			country: _.get(metaData, 'country'),
			language: _.get(metaData, 'language'),
			//episodesInfo: _.get(metaData, 'episodes'),
			background: _.get(metaData, 'background'),
			poster: _.get(metaData, 'poster'),
			logo: _.get(metaData, 'logo'),
			posterShape: 'contain',
			logoShape: 'contain',
			website: _.get(metaData, 'website') || _.get(metaData, 'external.website')
		};
	} catch(e) {
		console.log(`getMetaDataByName ${e.message}`);
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