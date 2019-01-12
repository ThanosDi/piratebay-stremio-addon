const imdb = require('imdb');
const torrentStream = require('torrent-stream');
const PirateBay = require('thepiratebay');

const cache = {};
const imdbIdToName = imdbId => {
	if (cache[imdbId]) {
		return cache[imdbId];
	}
	return new Promise(function (resolve, rejected) {
		imdb(imdbId, function(err, data) {
			if(err){
				rejected(new Error(err.message));
			}
			cache[imdbId] = data;
			resolve(data);
		});
	});
};

const torrentStreamEngine = magnetLink => {
	return new Promise(function (resolve, rejected) {
		const engine = new torrentStream(magnetLink, {
			connections: 30
		});
		engine.ready(() => {
			resolve(engine);
		});
	});
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
	ptbSearch
};