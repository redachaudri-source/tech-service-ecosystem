const https = require('https');

const token = 'pk.eyJ1IjoiZml4YXJyIiwiYSI6ImNta3BvdmxiczBlcWQzZnM2cWNobzBodXkifQ.MsyB8tBiEqmq4mflpcttRQ';
const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/calle%20rio%20verde%2017,%20Mijas,%20Malaga,%20Spain.json?access_token=${token}&limit=5&country=es`;

https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        const json = JSON.parse(data);
        if (json.features && json.features.length > 0) {
            console.log(JSON.stringify(json.features[0], null, 2));
        } else {
            console.log("No features found");
        }
    });
}).on('error', (err) => {
    console.error("Error: " + err.message);
});
