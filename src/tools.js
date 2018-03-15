const Stremio = require('stremio-addons');

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



module.exports = {
	nameToImdb,
	cinemeta
};