var express = require('express');
var app = express();
var OAuth = require('OAuth');
var url = require('url');
var fs = require('fs');
var http = require('http');
var https = require('https');
var crypto = require('crypto');
var util = require('util');
var promise = require('promise');
var qsocks = require('qsocks');

function query(uri, params, method, options) {
	
	if (!options)
		var options = {};
	
	if (!method)
		var method = 'POST'
		
	var p = new Promise(function(resolve, reject) {

		//Get and verify parameters
		options.Certificate = options.Certificate || './client.pfx';
		options.PassPhrase = options.PassPhrase || '';
		
		try {
			var cert = fs.readFileSync(options.Certificate);
		} catch (e) {
			reject('Missing client certificate');
			return;
		}
		
		var hostUri = url.parse(uri)
		var xrfkey = generateXrfkey();
		
		var settings = {
			host: hostUri.hostname,
			port: hostUri.port,
			path: hostUri.pathname + '?' + ((hostUri.query) ? hostUri.query + '&' : '') +  'xrfkey=' + xrfkey,
			method: method,
			headers: {
				'X-Qlik-Xrfkey': xrfkey,
				'X-Qlik-User' : 'UserDirectory= WINDOWS2012; UserId= qlikservice ',
				'Content-Type': 'application/json'
			},
			pfx: cert,
			passphrase: options.PassPhrase,
			rejectUnauthorized: false,
			agent: false
		};
		
		//Send ticket request
		var req = https.request(settings, function (res) {
			res.on('data', function (d) {
				var result = JSON.parse(d.toString());
				resolve(result);
			});
		});
		
		req.on('error', function(e) {
			reject(e);
		});
		
		if(params) {
			var jsonrequest = JSON.stringify(params);
			console.log(jsonrequest);
			req.write(jsonrequest);
		}
		
		req.end();

	});
	
	return p;
}

function generateXrfkey(size, chars) {
	size = size || 16;
	chars = chars || 'abcdefghijklmnopqrstuwxyzABCDEFGHIJKLMNOPQRSTUWXYZ0123456789';

	var rnd = crypto.randomBytes(size), value = new Array(size), len = chars.length;

	for (var i = 0; i < size; i++) {
		value[i] = chars[rnd[i] % len]
	};

	return value.join('');
}


app.get('/createSenseApp', function (req, res) {
	var newDocId;

	var templateAppName = 'Elastic Tweet Sense';
	var scriptMarker = '§search_terms§';
	var scriptReplace = req.query.q;
	var streamId = 'aaec8d41-5201-43ab-809f-3063750dfafd';

	var externalProxyUri = 'https://10.76.224.36';
	
	var wsGlobal;

	query('https://localhost:4243/qps/ticket', { 'UserDirectory': 'WINDOWS2012',  'UserId': 'QlikService', 'Attributes': []}).then(function(ticket)
	{ 
		var p = new Promise(function(resolve, reject) {
			
			var hostUri = url.parse('https://localhost/hub/?qlikTicket=' + ticket.Ticket);
			
			var settings = {
				host: hostUri.hostname,
				port: hostUri.port,
				path: hostUri.path,
				method: 'GET',
				rejectUnauthorized: false,
				agent: false
			};
			
			var req = https.request(settings, function (response) {
				response.on('data', function (d) {
					var cookies = response.headers['set-cookie'];
					var wsConfig = {
						host: 'localhost/app',
						isSecure: true,
						origin: 'http://localhost',
						rejectUnauthorized: false,
						headers: {
							"Content-Type": "application/json",
							"Cookie": cookies[0]
						}
					}
					resolve(qsocks.Connect(wsConfig));
				});
			});
			req.on('error', function(e) {
				reject(e);
			});
			req.end();
		});
		return p;
	}).then(function (conn) {
		wsGlobal = conn;
		return wsGlobal.getDocList();
	}).then(function(reply) {
		var p = new Promise(function(resolve, reject) {
			var arrayFound = reply.filter(function(item) {
				return item.qDocName == templateAppName;
			});
			if(arrayFound[0] && arrayFound[0].qDocId) resolve(arrayFound[0].qDocId);
			else reject('App not found :(');
		});
		return p;
	}).then(function(docId) {
		console.log('old app: ' + docId);
		return query('https://localhost:4242/qrs/app/' + docId + '/copy?name=' + templateAppName + ' ' + scriptReplace);
	}).then(function (results) {
		console.log('new app: ' + results.id);
		newDocId = results.id;
		return wsGlobal.openDoc(results.id);
	}).then(function(doc) {
		console.log('Doc opened');
		return doc.getScript().then(function (result) {
			return doc.setScript(result.replace(scriptMarker, scriptReplace)).then(function (result) {
				console.log('Script replaced');
				return doc;
			})
		});
	}).then(function(doc) {
		return doc.doReload().then(function(result) {
			console.log('Reload : ' + result);
			return doc.doSave().then(function(result) {
				console.log('Save : ' + result);
				return doc;
			});
		});
	}).then(function(doc) {
		return doc.publish(streamId).then(function(result) {
			return doc;
		});
	}).then(function(doc) {
		return query('https://localhost:4243/qps/user/WINDOWS2012/QlikService', null, 'DELETE');
	}).then(function(result) {
		res.redirect(externalProxyUri + '/sense/app/' + newDocId);
	}, function(err) {
		res.send(err);
	});

});



app.use(express.static(__dirname + '/public'));

app.listen(process.env.PORT || 3000);