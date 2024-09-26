//Importation des librairies
require('dotenv').config();
const { Client } = require('@notionhq/client');
const ICAL = require('ical.js');

// On créé un client Notion
const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function getUpcomingEventsForMoodle(calendarUrl) {
  const res = await fetch(calendarUrl);
  const icalData = await res.text();

  const jcalData = ICAL.parse(icalData);
  const comp = new ICAL.Component(jcalData);
  const vevents = comp.getAllSubcomponents('vevent');

  const now = new Date();
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(now.getDate() + 7);

  return vevents.map(vevent => {
    const event = new ICAL.Event(vevent);
    return {
      summary: event.summary,
      startDate: event.startDate.toJSDate(),
      endDate: event.endDate.toJSDate(),
      description: event.description,
      id: event.uid,
    }
  }).filter(event => event.startDate >= now && event.startDate <= sevenDaysFromNow)
}

async function getUpcomingEvents(calendarUrl) {
  const res = await fetch(calendarUrl);
  const icalData = await res.text();

  const jcalData = ICAL.parse(icalData);
  const comp = new ICAL.Component(jcalData);
  const vevents = comp.getAllSubcomponents('vevent');

  const now = new Date();
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(now.getDate() + 7);

  return vevents.map(vevent => {
    const event = new ICAL.Event(vevent);
    return {
      course: extractSummary(event.summary),
      start: event.startDate.toJSDate(),
      end: event.endDate.toJSDate(),
      location: event.location,
      description: parseDescription(event.description || ''),
    };
  })
  .filter(event => event.start >= now && event.start <= sevenDaysFromNow)
  .sort((a, b) => a.start < b.start ? 1 : -1);
}

const parseDescription = (description) => {
  const categories = description.match(/Catégorie: (.+)/);
  const tuteurs = description.match(/Tuteur: (.+)/);
  const groupes = description.match(/Groupe: (.+)/);
  const salle = description.match(/Salle: (.+)/);
  const desc = description.match(/Description: (.+)/);

  return {
    categorie: categories ? new Array(categories[1]) : [],
    tuteurs: tuteurs ? tuteurs[1].split(';').map(t => t.trim()) : [],
    groupes: groupes ? groupes[1].split(';').map(g => g.trim()) : [],
    salles: salle ? salle[1].split(';').map(s => s.trim()) : [],
    description: desc ? desc[1] : '',
  };
};

const extractSummary = (summary) => {
  const match = summary.match(/; (.*?);/);
  return match ? match[1] : '';
};

async function findNotionItemByName(name, databaseId) {
  const response = await notion.databases.query({
    database_id: databaseId,
  });
  return response.results.find(item => 
    item.url.includes(name.replace(/\s/g, '-').replace('\'', '-').replace('--', '-').toUpperCase())
  );
}


async function calendarProcessEvent(eventInfo, lastEvent) {
  if (eventInfo.description.categorie === '' || eventInfo.description.tuteurs.length === 0 || eventInfo.description.groupes.length === 0 || eventInfo.description.salles.length === 0 || eventInfo.description.description === '') {
    console.info('missing information !');
    return;
  }

  if (lastEvent && lastEvent.course === eventInfo.course) {
    const timeMarge = new Date(lastEvent.start).getTime() - new Date(eventInfo.end).getTime();
    console.log('Marge de temps ' + timeMarge + ' ms pour le cours "' + eventInfo.course + '", et le cours précédent "' + lastEvent.course + '"');

    if (timeMarge <= 900000 && timeMarge >= -900000) {
      eventInfo.end = lastEvent.end;
      eventInfo.description.tuteurs = [...new Set([...eventInfo.description.tuteurs, ...lastEvent.description.tuteurs])];
      eventInfo.description.categorie = [...new Set([...eventInfo.description.categorie, ...lastEvent.description.categorie])];
      eventInfo.description.groupes = [...new Set([...eventInfo.description.groupes, ...lastEvent.description.groupes])];
      eventInfo.description.salles = [...new Set([...eventInfo.description.salles, ...lastEvent.description.salles])];
      eventInfo.description.description = eventInfo.description.description + '\n' + lastEvent.description.description + '\n\n Cours fusionnés';
      console.info('Cours fusionnés !');
    } else {
      console.log('Cours non fusionnés !');
    }
  }

  const item = await findNotionItemByName(eventInfo.course, process.env.NOTION_DATABASE_COURS_ID);
  if (item) {
    console.info('Cours ' + eventInfo.course + ' trouvé ! Vérification des informations avant mise à jour...');
    const properties = item.properties;
    const date = properties.Date.date.start;
    const type = properties.Type.multi_select.map(t => t.name);
    const prof = properties.Prof.multi_select.map(t => t.name);
    const groupes = properties.Groupes.multi_select.map(t => t.name);
    const salle = properties.Salle.multi_select.map(t => t.name);
    const description = properties.Description.rich_text.map(t => t.text.content).join('');

    if (new Date(date).getTime() === new Date(eventInfo.start).getTime() && type.includes(eventInfo.description.categorie) && prof.every(p => eventInfo.description.tuteurs.includes(p)) && groupes.every(g => eventInfo.description.groupes.includes(g)) && salle.every(s => eventInfo.description.salles.includes(s)) && description === eventInfo.description.description) {
      console.info('Le cours de "' + eventInfo.course + '" est déjà à jour ! Passage au cours suivant...');
      return;
    } else {
      console.info('Le cours de "' + eventInfo.course + '" n\'est pas à jour ! Mise à jour en cours...');

      await notion.pages.update({
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
            multi_select: eventInfo.description.categorie.map(c => ({ name: c })),
          },
          Prof: {
            multi_select: eventInfo.description.tuteurs.map(t => ({ name: t })),
          },
          Groupes: {
            multi_select: eventInfo.description.groupes.map(g => ({ name: g })),
          },
          Salle: {
            multi_select: eventInfo.description.salles.map(s => ({ name: s })),
          },
          Description: {
            rich_text: [{ text: { content: eventInfo.description.description } }],
          },
        },
      });
    }
    console.info('Cours ' + eventInfo.course + ' mis à jour !');
  } else {
    console.info('Cours ' + eventInfo.course + ' non trouvé ! Création...');
    await notion.pages.create({
      parent: { type: 'database_id', database_id: process.env.NOTION_DATABASE_COURS_ID },
      properties: {
        title: { title: [{ text: { content: eventInfo.course } }] },
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
          multi_select: [{ name: eventInfo.description.categorie }],
        },
        Prof: {
          multi_select: eventInfo.description.tuteurs.map(t => ({ name: t })),
        },
        Groupes: {
          multi_select: eventInfo.description.groupes.map(g => ({ name: g })),
        },
        Salle: {
          multi_select: eventInfo.description.salles.map(s => ({ name: s })),
        },
        Description: {
          rich_text: [{ text: { content: eventInfo.description.description } }],
        },
      },
    });
    console.info('Nouveau cours, ' + eventInfo.course + ' ajouté !');
  }
}

// async function moodleProcessEvent(eventInfo) {
//   const item = await findNotionItemByName(eventInfo.summary, process.env.NOTION_DATABASE_TASKS_ID);

//   if(item) {
//     console.info('Tâche ' + eventInfo.summary + ' trouvée ! Vérification des informations avant mise à jour...');
//     const properties = item.properties;
//     const date = properties.Date.date.start;
//     const description = properties.Description.rich_text.map(t => t.text.content).join('');
   
//     if (new Date(date).getTime() === new Date(eventInfo.startDate).getTime() && description === eventInfo.description) {
//       console.info('La tâche de "' + eventInfo.summary + '" est déjà à jour ! Passage à la tâche suivante...');
//       return;
//     } else {
//       console.info('La tâche de "' + eventInfo.summary + '" n\'est pas à jour ! Mise à jour en cours...');

//       await notion.pages.update({
//         page_id: item.id,
//         properties: {
//           Date: {
//             "id": "M%3BBw",
//             "type": "date",
//             "date": {
//               "start": eventInfo.startDate,
//               "end": eventInfo.endDate,
//               "time_zone": null
//             }
//           },
//           Description: {
//             rich_text: [{ text: { content: eventInfo.description } }],
//           },
//         },
//       });
//       console.info('Tâche ' + eventInfo.summary + ' mise à jour !');
//     }
//   } else {
//     await notion.pages.create({
//       parent: { type: 'database_id', database_id: process.env.NOTION_DATABASE_TASKS_ID },
//       properties: {
//         title: { title: [{ text: { content: eventInfo.summary } }] },
//         Date: {
//           "id": "M%3BBw",
//           "type": "date",
//           "date": {
//             "start": eventInfo.startDate,
//             "end": eventInfo.endDate,
//             "time_zone": null
//           }
//         },
//         Description: {
//           rich_text: [{ text: { content: eventInfo.description } }],
//         },
//         id: {
//           rich_text: [{ text: { content: eventInfo.id } }],
//         }
//       },
//     });
//     console.info('Nouvelle tâche, ' + eventInfo.summary + ' ajoutée !');
//   }
// }

// async function mainMoodle() {
//   try {
//     const tasks = await getUpcomingEventsForMoodle(process.env.MOODLE_CALENDAR_URL);

//     console.log(tasks.length + ' events found !');

//     for(const tasksInfo of tasks) {
//       await moodleProcessEvent(tasksInfo);
//     }
//     console.log('Toutes les tâches ont été traitées !');
//   } catch (error) {
//     console.error('Erreur:', error);
//   }
// }

// mainMoodle();

async function mainCalendar() {
  console.log("Début du traitement des cours...");
  try {
    const events = await getUpcomingEvents(process.env.EDT_CALENDAR_URL);

    console.log(events.length + ' cours trouvés !');

    let lastEvent = null;
    for (const eventInfo of events) {
      await calendarProcessEvent(eventInfo, lastEvent);
      lastEvent = eventInfo;
    }
    console.log('Tous les cours ont été traités !');
  } catch (error) {
    console.error('Erreur:', error);
  }
}

setInterval(() => {
  console.log('Recherche de nouveaux cours...');
  const hours = new Date().getHours();
  if (hours === 7 || hours === 13) {
    mainCalendar();
  }
}, 60 * 60 * 1000);