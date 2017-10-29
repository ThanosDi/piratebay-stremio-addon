const PirateBay = require('thepiratebay');
const Stremio = require('stremio-addons');
const magnet = require('magnet-uri');
const tnp = require('torrent-name-parser');
const imdb = require('imdb');

process.env.STREMIO_LOGGING = true; // enable server logging for development purposes

const manifest = {
	// See https://github.com/Stremio/stremio-addons/blob/master/docs/api/manifest.md for full explanation
	"id": "org.stremio.piratebay",
	"version": "1.0.0",

	"name": "PirateBay Addon",
	"description": "Fetch PirateBay entries on a single episode.",
	"icon": "https://cdn.iconverticons.com/files/png/9797e1bf5cadde27_256x256.png",
	"background": "URL to 1366x756 png background",

	// Properties that determine when Stremio picks this add-on
	"types": ["movie", "series"], // your add-on will be preferred for those content types
	"idProperty": "imdb_id", // the property to use as an ID for your add-on; your add-on will be preferred for items with that property; can be an array
	// We need this for pre-4.0 Stremio, it's the obsolete equivalent of types/idProperty
	"filter": { "query.imdb_id": { "$exists": true }, "query.type": { "$in":["series","movie"] } }
};

const methods = { };
const addon = new Stremio.Server({
	"stream.find": function(args, callback) {
		if (args.query.type === 'series') {
			imdb(args.query.imdb_id, function(err, data) {
				console.log(args);
				if(err) {
					console.log(err.stack);
				}
				if(data){
					const {title} = data;
					PirateBay.search(`${title} s0${args.query.season}e0${args.query.episode}`, {
						orderBy: 'seeds',
						sortBy: 'desc'
					}).then((results) => {
						return callback(null, results.slice(0, 3).map( episode => {
							const {infoHash, announce } = magnet.decode(episode.magnetLink);
							const availability = episode.seeders == 0 ? 0 : episode.seeders < 5 ? 1 : 2;

							const { resolution = 'SD', quality, audio, group } = tnp(title);
							const detail = [ episode.name, quality, audio, group ].filter(val => val).join(" - ");

							return {
								infoHash,
								name: "PTB",
								title: detail,
								isFree: true,
								sources: [...announce.map(src => `tracker:${src}`), `dht:${infoHash}`],
								availability
							};
						}).filter(elem => elem.availability > 0));
					}).catch((err) => {
						console.error(err);
						return callback(new Error("internal"));
					});
				}
			});
		}
	}
}, manifest);

const server = require("http").createServer((req, res) => {
	addon.middleware(req, res, function() { res.end() }); // wire the middleware - also compatible with connect / express
}).on("listening", function()
{
	console.log("Sample Stremio Addon listening on "+server.address().port);


	/* Methods
	 */
	methods["stream.find"] = function(args, callback) {
		if (! args.query) return callback();
		callback(null, [dataset[args.query.imdb_id]]);
	}

}).listen(process.env.PORT || 7000);