const Stremio = require('stremio-addons');
const magnet = require('magnet-uri');
const videoExtensions = require('video-extensions');
const _ = require('lodash');
const {
	imdbIdToName,
	torrentStreamEngine,
	ptbSearch
} = require('./tools');

const manifest = {
	'id': 'org.stremio.piratebay',
	'version': '1.3.0',
	'name': 'PirateBay Addon',
	'description': 'Fetch PirateBay entries on a single episode or series.',
	'icon': 'https://static.wareziens.net/wp-content/image.php?url=http://www.turbopix.fr/up/1326291999.png',
	'logo': 'https://static.wareziens.net/wp-content/image.php?url=http://www.turbopix.fr/up/1326291999.png',
	'isFree': true,
	'email': 'thanosdi@live.com',
	'endpoint': 'https://piratebay-stremio-addon.herokuapp.com/stremio/v1',
	'types': ['movie', 'series'],
	'background':'http://wallpapercraze.com/images/wallpapers/thepiratebay-77708.jpeg',
	'idProperty': ['ptb_id', 'imdb_id'], // the property to use as an ID for your add-on; your add-on will be preferred for items with that property; can be an array
	// We need this for pre-4.0 Stremio, it's the obsolete equivalent of types/idProperty
	'filter': { 'query.imdb_id': { '$exists': true }, 'query.type': { '$in':['series','movie'] } }
};

const manifestLocal = {
	'id': 'org.stremio.piratebay.local',
	'version': '1.3.0',
	'name': 'PirateBay Addon local',
	'description': 'Fetch PirateBay entries on a single episode or series. local',
	'icon': 'https://static.wareziens.net/wp-content/image.php?url=http://www.turbopix.fr/up/1326291999.png',
	'logo': 'https://static.wareziens.net/wp-content/image.php?url=http://www.turbopix.fr/up/1326291999.png',
	'isFree': true,
	'email': 'thanosdi@live.com',
	'endpoint': 'http://localhost:7000/stremioget/stremio/v1',
	'types': ['movie', 'series'],
	'background':'http://wallpapercraze.com/images/wallpapers/thepiratebay-77708.jpeg',
	'idProperty': ['ptb_id', 'imdb_id'], // the property to use as an ID for your add-on; your add-on will be preferred for items with that property; can be an array
	// We need this for pre-4.0 Stremio, it's the obsolete equivalent of types/idProperty
	'filter': { 'query.imdb_id': { '$exists': true }, 'query.type': { '$in':['series','movie'] } }
};

const addon = new Stremio.Server({
	'stream.find': async (args, callback) => {
		if (args.query.type === 'series') {
			const seriesInfo = await seriesInformation(args);
			console.log(seriesInfo.episodeTitle);

			Promise.all([
					ptbSearch(seriesInfo.imdb),
					ptbSearch(seriesInfo.seriesTitle),
					ptbSearch(seriesInfo.episodeTitle)
			]).then(results => {
				const torrents = _.uniqBy(_.flatten(results), 'magnetLink')
					.filter(torrent => torrent.seeders > 0)
					.filter(torrent => seriesInfo.matches(escapeTitle(torrent.name)))
					.sort((a, b) => b.seeders - a.seeders)
					.slice(0, 5);

				Promise.all(torrents.map(async torrent => await openFiles(torrent)))
				.then(torrents => {
					console.log('opened torrents: ', torrents.map(torrent => torrent.name));

					const streams = torrents
						.filter(torrent => torrent.files)
						.map(torrent => findEpisode(torrent, seriesInfo))
						.filter(torrent => torrent.episode)
						.map(torrent => {
								const { infoHash } = magnet.decode(torrent.magnetLink);
								const availability = torrent.seeders < 5 ? 1 : 2;
								const title = `${torrent.name.replace(/,/g, ' ')}\n${torrent.episode.fileName}\n👤 ${torrent.seeders}`;

								return {
									infoHash: infoHash,
									fileIdx: torrent.episode.fileId,
									name: 'TPB',
									title: title,
									availability: availability
								};
							})
							.filter(stream => stream.infoHash);
					console.log('streams: ', streams.map(stream => stream.title));
					return callback(null, streams);
				}).catch((error) => {
					console.log(error);
					return callback(new Error(error.message))
				});
			}).catch((error) => {
				console.log(error);
				return callback(new Error(error.message))
			});
		} else {
			try {
				const results = await ptbSearch(args.query.imdb_id);

				return callback(null, results
					.filter(torrent => torrent.seeders > 0)
					.sort((a, b) => b.seeders - a.seeders)
					.slice(0, 5)
					.map(torrent => {
						const {infoHash} = magnet.decode(torrent.magnetLink);
						const availability = torrent.seeders < 5 ? 1 : 2;
						const detail = `${torrent.name}\n👤 ${torrent.seeders}`;
						return {
							infoHash,
							name: 'TPB',
							title: detail,
							availability
						};
					}));
			} catch (error) {
				return callback(new Error(error.message))
			}
		}
	},
}, manifest);

/*
 * Reads torrent files and tries to find a matched series episode.
 */
const findEpisode = (torrent, seriesInfo) => {
	try {
		torrent.episode = torrent.files
			.map((file, fileId) => {
				return {
					fileName: file.name,
					fileId: fileId,
					fileSize: file.length
				}
			})
			.filter(file => videoExtensions.indexOf(file.fileName.split('.').pop()) !== -1)
			.sort((a, b) => b.fileSize - a.fileSize)
			.find(file => seriesInfo.matchesEpisode(file.fileName));
		return torrent;
	} catch (e) {
		console.log(e);
		return torrent;
	}
};

/*
 * Append torrent files to the object.
 */
const openFiles = async torrent => {
	try {
		torrent.files = await torrentStreamEngine(torrent.magnetLink);
		return torrent;
	} catch (e) {
		console.log("failed opening:", torrent.name);
		return torrent;
	}
};

/*
 * Construct series info based on imdb_id
 */
const seriesInformation = async args => {
	try {
		const data = await imdbIdToName(args.query.imdb_id);
		let seriesTitle = (!data.originalTitle || data.originalTitle === 'N/A') ? data.title : data.originalTitle;
		seriesTitle = escapeTitle(seriesTitle);

		const seasonNum = parseInt(args.query.season);
		const episodeNum = parseInt(args.query.episode);

		const season = seasonNum < 10 ? `0${seasonNum}` : `${seasonNum}`;
		const episode = episodeNum < 10 ? `0${episodeNum}` : `${episodeNum}`;

		const seriesInfo = {
			imdb: args.query.imdb_id,
			seriesTitle: seriesTitle,
			episodeTitle:`${seriesTitle} s${season}e${episode}`,
			nameMatcher: new RegExp(
				`\\b${seriesTitle}\\b.*` + // match series title followed by any characters
					`(` + // start capturing second condition
						// first variation
						`\\bseasons?\\b[^a-zA-Z]*` + // contains 'season'/'seasons' followed by non-alphabetic characters
							`(` + // start capturing sub condition
								`\\bs?0?${seasonNum}\\b` + // followed by season number ex:'4'/'04'/'s04'/'1,2,3,4'/'1 2 3 4'
								`|\\b[01]?\\d\\b[^a-zA-Z]*-[^a-zA-Z]*\\b[01]?\\d\\b` + // or followed by season range '1-4'/'01-04'/'1-12'
							`)` + // finish capturing subcondition
						// second variation
						`|\\bs${season}\\b` + // or constrains only season identifier 's04'/'s12'
						// third variation
						`|\\bs[01]?\\d\\b[^a-zA-Z]*-[^a-zA-Z]*\\bs[01]?\\d\\b` + // or contains season range 's01 - s04'/'s01.-.s04'/'s1-s12'
						// fourth variation
						`|((\\bcomplete|all|full\\b).*(\\bseries|seasons|collection\\b))` + // or contains any two word variation from (complete,all,full)+(series,seasons)
					`)` // finish capturing second condition
			, 'i'), // case insensitive matcher
			episodeMatcher: new RegExp(
					`\\bs?0?${seasonNum}[^0-9]*(x|ep?)?${episode}\\b`// match episode naming cases S01E01/1x01/S1.EP01..
					, 'i'), // case insensitive matcher
		};
		seriesInfo.matchesName = title => seriesInfo.nameMatcher.test(title);
		seriesInfo.matchesEpisode = title => seriesInfo.episodeMatcher.test(title);
		seriesInfo.matches = title => seriesInfo.matchesName(title) || seriesInfo.matchesEpisode(title);
		return seriesInfo;
	} catch (e) {
		return new Error(e.message);
	}
};

const escapeTitle = title => {
	return title.toLowerCase()
		.normalize('NFKD') // normalize non-ASCII characters
		.replace(/[\u0300-\u036F]/g, '')
		.replace(/\./g, ' ') // replace dots with spaces
		.replace(/[^\w- ]/gi, ''); // remove all non-alphanumeric chars
};

const server = require('http').createServer((req, res) => {
	addon.middleware(req, res, function() { res.end() }); // wire the middleware - also compatible with connect / express
})
	.on('listening', () => {
		console.log(`Piratebay Stremio Addon listening on ${server.address().port}`);
	})
	.listen(process.env.PORT || 7000);
