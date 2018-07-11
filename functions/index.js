'use strict';
const functions = require('firebase-functions');
const {
    dialogflow,
    BasicCard,
    BrowseCarousel,
    BrowseCarouselItem,
    Button,
    Carousel,
    Image,
    LinkOutSuggestion,
    List,
    MediaObject,
    Suggestions,
    SimpleResponse,
    UpdatePermission,
    RegisterUpdate
} = require('actions-on-google');

const util = require('util');
const admin = require('firebase-admin');

const app = dialogflow({
    debug: true
});

admin.initializeApp(functions.config().firebase);
const db = admin.firestore();

const FirestoreNames = {
    CATEGORY: 'category',
    CREATED_AT: 'created_at',
    INTENT: 'intent',
    ANNOUNCEMENT: 'text',
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
    conv.ask(new UpdatePermission({intent: 'announcement.getlatest'}));
  });

  app.intent('announcement.finish_push_setup', (conv) => {
      console.log(conv.arguments.get('PERMISSION'));
    if (conv.arguments.get('PERMISSION')) {
      const userID = conv.arguments.get('UPDATES_USER_ID');
      console.log("user id: "+userID);
      // code to save intent and userID in your db
      conv.close(`Ok, I'll start alerting you. ${userID}`);
    } else {
      conv.close(`Ok, I won't alert you.`);
    }
  });
// Handle the Dialogflow intent named 'Default Welcome Intent'.
app.intent('input.welcome', conv => {
    console.log('welcome input');
    console.log(conv);
    conv.user.storage = {};
    var randomText = randomChoice(default_data.WELCOME_SUGGESTIONS);
    conv.ask(util.format(randomText, 'Kishore'));
    conv.ask(new Suggestions(default_data.WELCOME_SUGGESTIONS));
    //conv.ask(new UpdatePermission({intent: 'tell_latest_tip'}));
    // conv.ask(util.format(randomText, 'Kishore'));
    // conv.ask(new Suggestions(default_data.WELCOME_SUGGESTIONS));
    // return new Promise(function (resolve, reject) {
    //     getUserName(conv.user._id).then(users => {
    //         var userName = "test"
    //         users.forEach(item => {
    //             userName = item.data().firstName;
    //             console.log("user name %s", userName);
    //         })
    //         conv.ask(util.format(randomText, userName));
    //         conv.ask(new Suggestions(default_data.WELCOME_SUGGESTIONS));
    //         resolve();

    //     });
    // });
});

function getUserName(id) {
    let studentsRef = db.collection("students");
    return studentsRef.where("externalId", "==", id).get();
}

app.intent('input.fallback', (conv) => {
    console.log(conv);
    conv.ask(randomChoice(default_data.GENERAL_FALLBACKS));
});


app.intent('course.list_all', (conv) => {
    console.log('course function called')
    let coursesRef = db.collection("courses");
    console.log(JSON.stringify(conv))
    let courses = [];
    let list = new List({
        title: 'Course List',
        items: new OptionItems()
    });   

    return new Promise(function (resolve, reject) {
        coursesRef.where("grade", "==", 8).orderBy("name").get().then(snapshot => {
                snapshot.forEach(doc => {
                    console.log(JSON.stringify(doc.data()));
                    var item = doc.data();
                    var listItem = createListItem(item.id, item.name, item.description, item.imageUri);
                    console.log(JSON.stringify(listItem));
                    list.items.push(listItem);
                });
                conv.ask(list);
                resolve();

            })
            .catch(err => {
                console.error("Error occured while feteching student courses");
                conv.ask(randomChoice(default_data.GENERAL_FALLBACKS));
                resolve();
            });
    });
});

function createListItem(id, _title, _description, _imgUrl) {
    return new{
        [id]:{
        "title": _title,
        "description": _description,
        "image": new Image({
            url: _imgUrl,
            alt: _title + ' image logo',
        })
    }};
}

exports.createAnnouncement = functions.firestore
  .document(`${FirestoreNames.ANNOUNCEMENTS}/{id}`)
  .onCreate((snap, context) => {
    const request = require('request');
    const google = require('googleapis');
    const serviceAccount = require('./service-account.json');
    const jwtClient = new google.auth.JWT(
      serviceAccount.client_email, null, serviceAccount.private_key,
      ['https://www.googleapis.com/auth/actions.fulfillment.conversation'],
      null
    );
    
    let notification = {
      userNotification: {
        title: snap.get(FirestoreNames.ANNOUNCEMENT),
      },
      target: {},
    };
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
              intent: 'announcement.getlatest',
            };
            request.post('https://actions.googleapis.com/v2/conversations:send', {
              'auth': {
                'bearer': tokens.access_token,
              },
              'json': true,
              'body': {'customPushMessage': notification, 'isInSandbox': true},
            }, (err, httpResponse, body) => {
              if (err) {
                throw new Error(`API request error: ${err}`);
              }
              console.log(`${httpResponse.statusCode}: ` +
                `${httpResponse.statusMessage}`);
              console.log(JSON.stringify(body));
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
};
exports.dialogflowFirebaseFulfillment = functions.https.onRequest(app);