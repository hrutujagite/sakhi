require('dotenv').config();
const { handleMessage } = require('./controllers/messageController');

const mockSender = 'whatsapp:+1234567890';

const runTest = async () => {
    const inputs = [
        "RESET SESSION", // clear any persisted state
        "hi", 
        "+919876543210", 
        "Riya", 
        "cooking", 
        "400001",
        "help", // Triggers TRIAGE
        "1", // HAAN - Mujhe ABHI madad chahiye (TRIAGE -> EMERGENCY_CONFIRM)
        "1", // Yes — help me now (EMERGENCY_CONFIRM -> EMERGENCY)
    ];

    let results = [];

    for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i];
        
        let responseText = "";
        const req = {
            body: {
                From: mockSender,
                Body: input
            }
        };

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
        
        // Clean up escaped entities
        responseText = responseText.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        
        if (input !== "RESET SESSION") {
            results.push({ input, response: responseText });
        }
    }

    // Output as Markdown table
    console.log("| User Input | Bot Response |");
    console.log("|---|---|");
    for (const row of results) {
        const cleanInput = row.input.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
        const cleanResponse = row.response.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
        console.log(`| ${cleanInput} | ${cleanResponse} |`);
    }
};

runTest();
