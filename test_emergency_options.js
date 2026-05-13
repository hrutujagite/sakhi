require('dotenv').config();
const { handleMessage } = require('./controllers/messageController');

const mockSender = 'whatsapp:+1234567890';

const runTest = async () => {
    const baseSetup = [
        "RESET SESSION", 
        "hi", 
        "+919876543210", 
        "Riya", 
        "cooking", 
        "400001",
        "help", 
        "1", 
        "1" // Enters EMERGENCY mode
    ];

    const optionsToTest = [
        { name: "Alert friend", input: "1" },
        { name: "Safe steps", input: "2" },
        { name: "More places", input: "3" },
        { name: "I'm safe", input: "4" }
    ];

    let results = [];

    for (const option of optionsToTest) {
        // Run setup
        for (const input of baseSetup) {
            const req = { body: { From: mockSender, Body: input } };
            const res = { type: () => {}, send: () => {} };
            try { await handleMessage(req, res); } catch (e) {}
        }

        // Test option
        let responseText = "";
        const req = { body: { From: mockSender, Body: option.input } };
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
        results.push({ input: option.input, name: option.name, response: responseText });
    }

    // Output results as a Markdown table
    console.log("| User Input | Action | Bot Response |");
    console.log("|---|---|---|");
    for (const row of results) {
        const cleanResponse = row.response.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
        console.log(`| \`${row.input}\` | ${row.name} | ${cleanResponse} |`);
    }
};

runTest();
