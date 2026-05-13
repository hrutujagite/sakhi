require('dotenv').config();
const { handleMessage } = require('./controllers/messageController');

const mockSender = 'whatsapp:+1234567890';

const runTest = async () => {
    const inputs = [
        "RESET SESSION", 
        "hi", 
        "+919876543210", 
        "Riya", 
        "cooking", 
        "400001",
        "erase" // Triggers Disguise
    ];

    let results = [];

    for (const input of inputs) {
        let responseText = "";
        const req = { body: { From: mockSender, Body: input } };
        const res = {
            type: () => {},
            send: (xml) => {
                const match = xml.match(/<Message>(.*?)<\/Message>/s);
                if (match) {
                    responseText = match[1];
                } else {
                    responseText = xml;
                }
            }
        };

        try {
            await handleMessage(req, res);
        } catch (e) {
            responseText = "ERROR: " + e.message;
        }
        
        responseText = responseText.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        
        if (input === "erase") {
            results.push({ input, response: responseText });
        }
    }

    console.log(JSON.stringify(results, null, 2));
};

runTest();
