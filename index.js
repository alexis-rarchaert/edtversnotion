require('dotenv').config();
const { google } = require('googleapis');
const { OAuth2 } = google.auth;
const calendar = google.calendar('v3');
const { Client } = require('@notionhq/client');

const oAuth2Client = new OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);
oAuth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const databaseId = process.env.NOTION_DATABASE_ID;

async function getUpcomingEvents() {
    const res = await calendar.events.list({
      auth: oAuth2Client,
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      timeMin: (new Date()).toISOString(),
      maxResults: 15,
      singleEvents: true,
      orderBy: 'startTime',
    });
    return res.data.items.reverse();
}
  
async function findNotionItemByName(name) {
    const response = await notion.databases.query({
      database_id: databaseId,
    });
    var resultItem = null;
    for (const item of response.results) {
        if (item.url.includes(name.replace(/\s/g, '-').replace('\'', '-').replace('--', '-').toUpperCase())) {
            resultItem = item;
        }
    } 
    return resultItem;
}

  const extractSummary = (summary) => {
    const match = summary.match(/; (.*?);/);
    return match ? match[1] : '';
  };

  async function main() {
    try {
      const events = await getUpcomingEvents();

      const parseDescription = (description) => {
        const categories = description.match(/Catégorie: (.+)/);
        const tuteurs = description.match(/Tuteur: (.+)/);
        const groupes = description.match(/Groupe: (.+)/);
        const salle = description.match(/Salle: (.+)/);
        const desc = description.match(/Description: (.+)/);
      
        return {
          categorie: categories ? categories[1] : '',
          tuteurs: tuteurs ? tuteurs[1].split(';').map(t => t.trim()) : [],
          groupes: groupes ? groupes[1].split(';').map(g => g.trim()) : [],
          salles: salle ? salle[1].split(';').map(s => s.trim()) : [],
          description: desc ? desc[1] : '',
        };
      };
      
      const eventInfos = events.map((event) => {
        const parsedDescription = parseDescription(event.description || '');
        return {
          summary: extractSummary(event.summary),
          location: event.location,
          start: event.start.dateTime,
          end: event.end.dateTime,
          ...parsedDescription,
        };
      });

      console.log(eventInfos.length + ' events found !');

      var lastEvent;
      for (const eventInfo of eventInfos) {
        const items = await notion.databases.query({
          database_id: databaseId,
        });

        if(eventInfo.categorie == '' || eventInfo.tuteurs.length == 0 || eventInfo.groupes.length == 0 || eventInfo.salles.length == 0 || eventInfo.description == '') {
            console.info('missing information !');
            continue;
        }

        if(lastEvent && lastEvent.summary == eventInfo.summary) {
          var timeMarge = new Date(lastEvent.start).getTime() - new Date(eventInfo.end).getTime();
          console.log('time marge : ' + timeMarge + ' ms for event ' + eventInfo.summary + ' and last event ' + lastEvent.summary);

          //si la marge est plus petite ou égale à 15 minutes, on merge les deux events
          if(timeMarge <= 900000) {
            eventInfo.end = lastEvent.end;

            eventInfo.tuteurs = [...new Set([...eventInfo.tuteurs, ...lastEvent.tuteurs])];
            eventInfo.groupes = [...new Set([...eventInfo.groupes, ...lastEvent.groupes])];
            eventInfo.salles = [...new Set([...eventInfo.salles, ...lastEvent.salles])];
            eventInfo.description = eventInfo.description + '\n' + lastEvent.description + '\n\n Cours fusionnés';

            console.info('events merged !');
          }
        }

        const item = await findNotionItemByName(eventInfo.summary);
        if(item) {
            console.info('item found !')

            const updatedPage = await notion.pages.update({
                page_id: item.id,
                properties: {
                    Date: {
                        "id": "M%3BBw",
                        "type": "date",
                        "date": {
                        "start": eventInfo.start,
                        "end": eventInfo.end,
                        "time_zone": null
                        }
                    },
                    Type: {
                        multi_select: [
                            {
                                name: eventInfo.categorie,
                            },
                        ],
                    },
                    Prof: {
                        multi_select: eventInfo.tuteurs.map(t => {
                            return {
                                name: t,
                            }
                        }),
                    },
                    Groupes: {
                        multi_select: eventInfo.groupes.map(g => {
                            return {
                                name: g,
                            }
                        }),
                    },
                    Salle: {
                        multi_select: eventInfo.salles.map(s => {
                            return {
                                name: s,
                            }
                        }),
                    },
                    Description: {
                        rich_text: [
                        {
                            text: {
                            content: eventInfo.description,
                            },
                        },
                        ],
                    },
                },
            });

            console.info('item updated !')
        } else {
            console.info('item not found ! creating item...')

            const newPage = await notion.pages.create({
                
                parent: { 
                    "type": 'database_id',
                    "database_id": databaseId 
                },
                properties: {
                    title: {
                        title: [
                            {
                                text: {
                                    content: eventInfo.summary,
                                },
                            },
                        ]
                    },
                  Date: {
                    "id": "M%3BBw",
                    "type": "date",
                    "date": {
                    "start": eventInfo.start,
                    "end": eventInfo.end,
                    "time_zone": null
                    }
                
                    
                  },
                  Type: {
                    multi_select: [
                        {
                            name: eventInfo.categorie,
                        },
                    ],
                  },
                  Prof: {
                    multi_select: eventInfo.tuteurs.map(t => {
                        return {
                            name: t,
                        }
                    }),
                  },
                  Groupes: {
                    multi_select: eventInfo.groupes.map(g => {
                        return {
                            name: g,
                        }
                    }),
                  },
                  Salle: {
                    multi_select: eventInfo.salles.map(s => {
                        return {
                            name: s,
                        }
                    }),
                  },
                  Description: {
                    rich_text: [
                      {
                        text: {
                          content: eventInfo.description,
                        },
                      },
                    ],
                  },
                },
              });

                console.info('item created !')
        }
        
        lastEvent = eventInfo;
      }

    } catch (error) {
      console.error('Error:', error);
    }
  }
  
setInterval(() => {
    console.log('running script...');

    var date = new Date();
    var hours = date.getHours();

    if(hours == 7 || hours == 13) {
        main();
    }  
}, 60*60*1000);
  