require('dotenv').config();

const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const os = require('os')
const dns = require('dns');
//const { SeverityNumber } = require('@opentelemetry/api-logs');

const app = express();

// Middleware to parse JSON requests
app.use(bodyParser.json());


async function sendToSplunk(index, host, data) {
    // payload for Splunk
    const splunkPayload = {
        index: index,       // index name of db
        host: host, // Name of computer/Server
        event: data,      // The event data you want to send
        time: Date.now(), // Timestamp (optional)
        sourcetype: '_json', // Optional: Specify the sourcetype
    };

    // Send data to Splunk using axios
    const response = await axios.post(process.env.SPLUNK_URL, splunkPayload, {
        headers: {
            'Authorization': `Splunk ${process.env.SPLUNK_TOKEN}`,
            'Content-Type': 'application/json',
        },
    });

    console.log('Data sent to Splunk:', response.data);
}

// Convert Ip Adress to dns
function findDNSByIpAdress(ipAdress) {
    try {
        dns.reverse(host, (err, hostnames) => {
            console.log('Hostnames:', hostnames);
            return hostnames[0];
        });
    }
    catch {
        return ipAdress;
    }
}


// Route to receive JSON data and send to Splunk
app.post('/send-to-splunk/:index', async (req, res) => {
    const data = req.body;
    const index = req.params.index;
    try {
        const ip = req.socket.remoteAddress.replace('::ffff:', ''); //remove ::ffff: from the ip
        const host = findDNSByIpAdress(ip)

        await sendToSplunk(index, host, data);
        res.status(200).json({ message: 'Data sent to Splunk successfully' });
    } catch (error) {
        console.error('Error sending data to Splunk:', error);
        res.status(500).json({ message: 'Failed to send data to Splunk', error: error.message });
    }
});

// Start the Express server
app.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}`);
});
