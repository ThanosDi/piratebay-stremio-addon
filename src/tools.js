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
			const files = engine.files;
			engine.destroy();
			resolve(files);
		});
		setTimeout(() => {
			engine.destroy();
			rejected(new Error("No available connections for torrent!"));
		}, 3000);
	});
};

const ptbSearch = async query=> {
	return await PirateBay.search(query, {
		orderBy: 'seeds',
		sortBy: 'desc',
		category: 'video',
		proxyList: ['https://pirateproxy.sh', 'https://pirateproxy.gdn']
	})
	.then(results => {
		console.log("piratebay results: ", results.results.length);
		return results.results;
	})
	.catch(err => {
		console.log(`failed \"${query}\" query.`);
		return [];
	});
};

module.exports = {
	imdbIdToName,
	torrentStreamEngine,
	ptbSearch
};