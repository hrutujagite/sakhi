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
        "1", // Legal rights
        "1", // Right to home
        "0", // Back to menu
        "2", // Find shelter
        "2", // Manually
        "Pune", // District
        "3", // FIR
        "He hit me", 
        "Yesterday", 
        "Husband", 
        "No", 
        "Bruises",
        "4", // Just talk
        "cooking", // Disguise
        "aloo", // Recipe
        "erase", // Erase
        "help", // Help trigger
        "1", // Yes, emergency
        "1", // Confirm emergency
        "2", // Safety steps
        "4"  // Safe now
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
        
        // Clean up escaped entities and newlines for table
        responseText = responseText.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        
        // Only push to results if it's not the hidden RESET SESSION
        if (input !== "RESET SESSION") {
            results.push({ input, response: responseText });
        }
    }

    // Output as Markdown table
    console.log("| User Input | Bot Response |");
    console.log("|---|---|");
    for (const row of results) {
        // escape pipes and replace newlines with <br> for markdown table compatibility
        const cleanInput = row.input.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
        const cleanResponse = row.response.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
        console.log(`| ${cleanInput} | ${cleanResponse} |`);
    }
};

runTest();
