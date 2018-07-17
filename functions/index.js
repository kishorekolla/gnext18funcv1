'use strict';
const functions = require('firebase-functions');
const coursesList = require('./courses.json');

const {
    dialogflow,
    List,
    BrowseCarousel,
    BrowseCarouselItem,
    Suggestions,
    SimpleResponse,
    UpdatePermission,
    Carousel
} = require('actions-on-google');

const {
    WebhookClient
} = require('dialogflow-fulfillment');
const {
    Card,
    Image,
    Text,
    Suggestion,
    Payload
} = require('dialogflow-fulfillment');

const util = require('util');
const admin = require('firebase-admin');

const app = dialogflow({
    debug: true
});

app.middleware((conv) => {
    conv.hasScreen =
        conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT');
    conv.hasAudioPlayback =
        conv.surface.capabilities.has('actions.capability.AUDIO_OUTPUT');
});

admin.initializeApp(functions.config().firebase);
const db = admin.firestore();
const storage = admin.storage();
const userName = 'Kishore';
const FirestoreNames = {
    CATEGORY: 'category',
    CREATED_AT: 'created_at',
    INTENT: 'intent',
    ANNOUNCEMENT_TITLE: 'title',
    ANNOUNCEMENT_TEXT: 'text',
    ANNOUNCEMENT_ID: 'id',
    ANNOUNCEMENTS: 'announcements',
    URL: 'url',
    USERS: 'students',
    USER_ID: 'externalId',
};

const TELL_LATEST_TIP_INTENT = 'tell_latest_tip';


function randomChoice(arr) {
    return arr[Math.floor(arr.length * Math.random())];
}
app.intent('announcement.select', (conv) => {
    // conv.ask(new UpdatePermission({intent: 'announcement.getlatest'}));
    conv.ask(new UpdatePermission({
        intent: 'announcement.getlatest'
    }));
});

app.intent('announcement.finish_push_setup', (conv) => {
    console.log(JSON.stringify(conv.arguments));
    if (conv.arguments.get('PERMISSION')) {
        const userID = conv.arguments.get('UPDATES_USER_ID');
        // code to save intent and userID in your db
        conv.close(`Ok, I'll start alerting you.`);
    } else {
        conv.close(`Ok, I won't alert you.`);
    }
});
// Handle the Dialogflow intent named 'Default Welcome Intent'.
app.intent('input.welcome', conv => {

    var randomText = randomChoice(default_data.WELCOME_SUGGESTIONS);
    conv.ask(new SimpleResponse({
        speech: util.format(randomText, userName),
        text: util.format(randomText, userName)
    }));
    conv.ask(new Suggestions(default_data.WELCOME_SUGGESTIONS));
});

app.intent('input.fallback', (conv) => {
    conv.ask(randomChoice(default_data.GENERAL_FALLBACKS));
});

app.intent('course.list_all', (conv) => {
    console.log(JSON.stringify(coursesList));
    var randomText = randomChoice(default_data.COURSE_SELECT);
    let optionItems = [];

    for (let index = 0; index < coursesList.length; index++) {
        var element = coursesList[index];
        optionItems.push(new ListOption({
            title: element.name,
            synonyms: [element.name, element.descriptionHeading],
            description: element.description,
            image: new Image({
                url: element.imageUri,
                alt: element.descriptionHeading,
            })
        }));
    }
    conv.contexts.set(default_data.OUT_CONTEXT_COURSE, 5, {
        type: default_data.OUT_CONTEXT_COURSE
    })

    conv.ask(randomText);

    conv.ask(new List({
        items: optionItems
    }));

});

exports.downloadFile = functions.https.onRequest((req, res) => {
    let filename = req.query.filename;
    storage.bucket().file(filename).download().then(function (buffer) {
        var extension = filename.split('.')[1];
        res.contentType("audio/" + extension);
        return res.send(buffer.toString());
    }).catch(function (error) {
        console.error("Error occured while downlading file : " + JSON.stringify(error));
        return res.send(500, 'Sorry, error occured while downloading file');
    });
});


exports.getAnnouncementById = functions.https.onRequest((req, res) => {
    var announcementRef = db.collection(FirestoreNames.ANNOUNCEMENTS).doc(req.query.id);

    announcementRef.get().then(doc => {
            if (!doc.exists) {
                console.log(`No announcement found for the id ${req.query.id}`);
            } else {
                res.json({
                    result: doc.data()
                });
            }
        })
        .catch(err => {
            console.log(`Error getting announcement document id ${req.query.id}`, err);
            return res.send(500, 'Sorry, error occured while feteching announcement ' + JSON.stringify(err));
        });
});

exports.getLatestAnnouncements = functions.https.onRequest((req, res) => {
    let lastSeen = req.query.lastSeen;
    let grade = req.query.grade;
    let items = [];

    var announcementsQuery = db.collection(FirestoreNames.ANNOUNCEMENTS)
        .where("grade", "==", parseInt(grade));
    if (lastSeen != undefined && lastSeen != null && lastSeen != '')
        announcementsQuery = announcementsQuery.where("added_at", ">", new Date(lastSeen));

    announcementsQuery
        .get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                var item = doc.data();
                items.push(item);
            });

            res.json({
                result: items
            });
        })
        .catch(err => {
            console.error("Error occured while feteching announcements: " + JSON.stringify(err));
            return res.send(500, 'Sorry, error occured while feteching announcements ' + JSON.stringify(err));
        });
});

exports.createAnnouncement = functions.firestore
    .document(`${FirestoreNames.ANNOUNCEMENTS}/{id}`)
    .onCreate((snap, context) => {
        const request = require('request');
        const google = require('googleapis');
        const serviceAccount = require('./service-account.json');
        console.log(JSON.stringify(snap));
        console.log(JSON.stringify(context));
        const jwtClient = new google.auth.JWT(
            serviceAccount.client_email, null,
            serviceAccount.private_key, 
            ['https://www.googleapis.com/auth/actions.fulfillment.conversation'],
            null
        );

        let notification = {
            userNotification: {
                title: snap.get(FirestoreNames.ANNOUNCEMENT_TITLE),
                text: snap.get(FirestoreNames.ANNOUNCEMENT_TEXT)
            },
            target: {},
        };
        let announcementId = snap.params.id;
        jwtClient.authorize((err, tokens) => {
            if (err) {
                throw new Error(`Auth error: ${err}`);
            }
            db.collection(FirestoreNames.USERS)
                .where("id", "==", "kishorekolla")
                .get()
                .then((querySnapshot) => {
                    querySnapshot.forEach((user) => {
                        notification.target = {
                            userId: user.get(FirestoreNames.USER_ID),
                            intent: 'announcement.get_notification',
                            argument: {
                                name: "id",
                                textValue: announcementId
                            }
                        };
                        console.log(`access token :  ${tokens.access_token} `);
                        request.post('https://actions.googleapis.com/v2/conversations:send', {
                            auth: {
                                'bearer': tokens.access_token,
                            },
                            json: true,
                            body: {
                                'customPushMessage': notification
                            }
                        }, (err, httpResponse, body) => {
                            if (err) {
                                throw new Error(`API request error: ${err}`);
                            }
                            console.log(`${httpResponse.statusCode}: ` +
                                `${httpResponse.statusMessage}`);
                            console.log(`${body}`);
                        });
                    });
                })
                .catch((error) => {
                    throw new Error(`Firestore query error: ${error}`);
                });
        });
        return 0;
    });

const default_data = {
    WELCOME_SUGGESTIONS: [
        'list my classes',
        'read announcements',
        'pending assignments',
        'take quiz',
        'go to class',
        'Alert me of new tips'
    ],

    WELCOME_TEXT: [
        'You can go to a class, do your homework, list your classes, take a quiz or read latest school announcements'
    ],

    GENERAL_FALLBACKS: [
        "I didn't get that. Can you say it again?",
        'I missed what you said. Say it again?',
        'Sorry, could you say that again?',
        'Sorry, can you say that again?',
        'Can you say that again?',
        "Sorry, I didn't get that.",
        'Sorry, what was that?',
        'One more time?',
        'Say that again?',
        "I didn't get that.",
        'I missed that.',
        "Couldn't understand, try again?"
    ],

    UNREAD_ANNOUNCEMENTS: [
        'Hey %s, you have %s new announcements',
        '%s, %s new announcements'
    ],

    UNREAD_ANNOUNCEMENT: [
        'Hey %s, an announcement for yo',
        '%s, you have one announcement'
    ],

    NO_UNREAD_ANNOUNCEMENTS: [
        'No new announcements for yo'
    ],

    NO_HOMEWORK: [
        '%s, you have no homework today',
        '%s, no homework today'
    ],

    PENDING_HOMEWORKS: [
        '%s, you have %s assignments pending, start with the first ?',
        '%s, %s assignments due, do them now ?'
    ],

    PENDING_HOMEWORK: [
        '%s, assignment %s pending, begin now?',
        '%s, do you want to start your assignment %s now ?'
    ],

    WELCOME_BASIC: [
        'Hello %s, every day\'s a learning day, what can I help you with ?',
        'Dear %s, let the learning begin, here\'s what we can do ?',
        '%s, kindle your curiosity, let us begin with ',
        '%s, I can help you with ',
        '%s, let us begin with ',
        'what do you want to do first '
    ],

    COURSE_SELECT: [
        'which class would you want to begin with ?',
        'select a class to start ',
        'you\'re enrolled for the following, select one'
    ],

    LESSON_SELECT: [
        'which lesson do you want to study?',
        'Here are your lessons, select one'
    ],

    LESSON_ACTIVITY_SELECT: [
        'Lesson has these study materials, choose one?',
        'Here are your study materials, select one'
    ],

    LESSON_ACTIVITY_DO: [
        'Do this activity now'
    ],
    EVENT_NEXT_QUESTION: 'action_next_question',

    OUT_CONTEXT_COURSE: 'course',
    OUT_CONTEXT_ANNOUNCEMENT: 'announcement',
    OUT_CONTEXT_HOMEWORK: 'homework',
    OUT_CONTEXT_DO_HOMEWORK: 'homework_do',
    OUT_CONTEXT_LESSON: 'lesson',
    OUT_CONTEXT_LESSON_ACTIVITY: 'lesson_activity',
    OUT_CONTEXT_LESSON_ACTIVITY_DO: 'lesson_activity_do',
    OUT_CONTEXT_QUIZ: 'quiz',
    OUT_CONTEXT_QUIZ_DO: 'quiz_do',
    OUT_CONTEXT_QUIZ_QUESTION: 'quiz_question',
};
exports.dialogflowFirebaseFulfillment = functions.https.onRequest(app);