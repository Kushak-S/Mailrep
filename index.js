const express = require("express")
const app = express()
app.use(express.json())
const port = 4000

const path = require("path");
const { authenticate } = require("@google-cloud/local-auth");
const fs = require("fs").promises;
const { google } = require("googleapis");

// definig scopes : scopes are permissions that the application will request from user
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",    // fetch unreplied mails
  "https://www.googleapis.com/auth/gmail.send",    // send automated response
  "https://www.googleapis.com/auth/gmail.labels",    // create new label
  "https://www.googleapis.com/auth/gmail.modify",    // add replied mails to newly created label
];


app.get("/api", async (req, res) => {
    // get authorization from credentials
    const auth = await authenticate({
        keyfilePath: path.join(__dirname, "credentials.json"),
        scopes: SCOPES,
    });

    const gmail = google.gmail({ version: "v1", auth });

    // function to fetch unreplied mails
    async function getUnrepliedMails(auth) {
        console.log('Fetching unreplied mails...');

        const response = await gmail.users.messages.list({
            userId: "me",
            labelIds: ["INBOX"],
            q: '-in:chats -from:me -has:userlabels',
        });
        return response.data.messages || [];
    }

    // function to add label to the messages
    async function addLabel(auth, message, labelId) {
        await gmail.users.messages.modify({
        userId: 'me',
        id: message.id,
        requestBody: {
        addLabelIds: [labelId],
        removeLabelIds: ['INBOX'],
        },
        });
    }

    // fuction to create new label
    async function createLabel(auth) {
        console.log('Creating new label...')

        const newLabel = "Automated";
        try {
            const response0 = await gmail.users.labels.list({ userId: "me"});
            const label = response0.data.labels.find(
                (label) => label.name === newLabel
            );
            if (label){
                console.log('Label [Automated] already exists');
                return label.id;
            }

            const response = await gmail.users.labels.create({
            userId: "me",
            requestBody: {
                name: newLabel,
                labelListVisibility: "labelShow",
                messageListVisibility: "show",
            },
            });
            console.log(`New label [Automated] has been created ID: ${labelId}`);
            return response.data.id;
        } catch (error) {
            throw error;
        }
    }

    // function to send automated reply
    async function sendReply (auth, message) {
        console.log('Sending automated reply...');
        try{
            const res = await gmail.users.messages.get({
                userId: 'me',
                id: message.id,
                format: 'metadata',
                metadataHeaders: ['Subject', 'From'],
            });
            console.log(res.data.payload);
            const subject = res.data.payload.headers.find(
                (header) => header.name === 'Subject'
            ).value
    
            const from = res.data.payload.headers.find(
                (header) => header.name === 'From'
            ).value;
            
            const  replyTo = from.match(/<(.*)>/)? from.match(/<(.*)>/)[1] : from;
            const replySubject =  subject.startsWith('Re:') ? subject: `Re: ${subject}`;
            const replyMessage = `Hi,\n\nI am current not available and will get back to you soon.\nThanks for reaching out to me.\n\nRegards,\nSaksham Yadav\n\nThis is a system generated mail.`;
            const rawMessage = [
                `From: me`,
                `To: ${replyTo}`,
                `Subject: ${replySubject}`,
                `In-Reply-To: ${message.id}`, 
                `References: ${message.id}`,
                '',
                replyMessage,
                ].join('\n');
    
            const encodedMessage = Buffer.from(rawMessage).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            await gmail.users.messages.send({
                userId: 'me',
                requestBody: {
                raw: encodedMessage,
                },
            });
        }catch(error){
            throw error;
        }
    }


    async function main() {
        const labelId = await createLabel(auth);

        // To repeatedly check for new unreplied mails and send automated reply
        setInterval(async () => {

            // Fetching unreplied mails
            const messages = await getUnrepliedMails(auth);
            console.log(`found ${messages.length} unreplied messages`);

            for (const message of messages) {
                // Sending automated reply for each mail
                await sendReply(auth, message);
                console.log(`sent automated reply to message with id ${message.id}`);
                
                // Attaching new label to mails after automated reply
                await addLabel(auth, message, labelId);
                console.log(`Added [Automated] label to message with id ${message.id}`);
            }
        }, Math.floor(Math.random() * (120 - 45 + 1) + 45) * 1000);
    };


main().catch(console.error);
});

app.listen(port, () => {
  console.log(`Application running...`);
});