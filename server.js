require('dotenv').config();

const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const { IncomingWebhook } = require("ms-teams-webhook");

const app = express();

// Middleware to parse JSON requests
app.use(bodyParser.json());

function checkStatusSevirity(status) {
    if (status >= 200 && status < 300)
        return 'info';

    if (status >= 300 && status < 400)
        return 'warning';

    else if (status >= 400 && status < 500)
        return 'error';

    else if (status >= 500 && status < 600)
        return 'critical';
}

// Microsoft Teams Notifications
async function teamsNotification(data, time, teamsUrl) {
    try {
        if (!teamsUrl) {
            throw new Error("MS_TEAMS_WEBHOOK_URL is required");
        }
        // Microsoft Teams Webhook notification send to channel
        const webhook = new IncomingWebhook(teamsUrl);
        await webhook.sendRawAdaptiveCard({
            "@type": "MessageCard",
            "@context": "https://schema.org/extensions",
            summary: `${data.hostname} Error ${data.status}`, // Notification box text
            themeColor: "0078D7",
            title: `${data.hostname} Error ${data.status}`,
            sections: [
                {
                    activityTitle: `TraceID: `, // Title
                    activitySubtitle: `${time.getUTCDate().toString().padStart(2, '0')}-${(time.getUTCMonth() + 1).toString().padStart(2, '0')}-${time.getUTCFullYear()} ${time.getUTCHours().toString().padStart(2, '0')}:${time.getUTCMinutes().toString().padStart(2, '0')}:${time.getUTCSeconds().toString().padStart(2, '0')}`, // Sub Title
                    activityImage: "https://igorsec.blog/wp-content/uploads/2023/09/splunk.jpg", // Image of sender
                    text: data.message || "Empty Message, Check in Splunk",
                },
            ],
        });

        console.log('Notification sent to Microsoft Teams Channel successfully');
    } catch (error) {
        console.error('Error sending Notification to Microsoft Teams:', error.message);
    }
}

async function sendToSplunk(index, data, time) {
    // payload for Splunk
    const splunkPayload = {
        index: index,       // index name of db
        host: data.hostname, // Name of computer/Server
        event: data, // The event data you want to send
        time: time.toUTCString, // Timestamp (optional)
        sourcetype: '_json', // Optional: Specify the sourcetype
        fields: {
            severity: checkStatusSevirity(data.status), // Sevrity level
        }
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

// Route to receive JSON data and send to Splunk
app.post('/send-to-splunk/:index', async (req, res) => {
    const data = req.body;
    const teamsUrl = data.teamsUrl; // Microsoft Teams Url Webhook;
    const index = req.params.index;
    const time = new Date(Date.now());
    try {
        delete data.teamsUrl;
        const ip = req.socket.remoteAddress.replace('::ffff:', ''); //remove ::ffff: from the ip
        data.ip = ip;
        await sendToSplunk(index, data, time);

        if (data.status >= 400)
            await teamsNotification(data, time, teamsUrl); // ip needs to change to hostname 

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
