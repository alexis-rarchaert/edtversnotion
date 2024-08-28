require('dotenv').config();
const { google } = require('googleapis');
const { OAuth2 } = google.auth;

const oAuth2Client = new OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "http://localhost"
);

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
});

console.log('Autoriser l\'app en accédant à cette URL: ', authUrl);

const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Entrez le code obtenu sur la page: ', (code) => {
  rl.close();
  oAuth2Client.getToken({ code, redirect_uri: 'http://localhost' }, (err, token) => {
    if (err) return console.error('Erreur: ', err);
    console.log('Votre token est:', token.refresh_token);
  });
});