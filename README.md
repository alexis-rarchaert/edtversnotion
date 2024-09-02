# EDTVersNotion

This project synchronizes events from a Google Calendar to a Notion database.

## Description

The project fetches upcoming events from a specified Google Calendar and updates or creates corresponding entries in a Notion database. If two consecutive events have the same name and the end date of the first event is within 15 minutes of the start date of the second event, their dates are merged.

## Installation

1. Clone the repository:
    ```sh
    git clone https://github.com/alexis-rarchaert/edtversnotion.git 
    cd edtversnotion
    ```

2. Create .env file
    ```sh
    GOOGLE_REFRESH_TOKEN =
    GOOGLE_CLIENT_ID =
    GOOGLE_CLIENT_SECRET =

    GOOGLE_CALENDAR_ID =

    NOTION_TOKEN =
    NOTION_DATABASE_COURS_ID =
    NOTION_DATABASE_MEALS_ID =
    ```

3. Install dependencies:
    ```sh
    npm install
    ```

## Usage

1. Configure your Google API and Notion API credentials as described in the [Configuration](#Configuration)
2. Run the script:
    ```sh
    node index.js
    ```

## Configuration

1. **Google API**:
    - Obtain OAuth2 credentials from the Google Developer Console.
    - Set the `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` and `GOOGLE_CALENDAR_ID` in the script.

2. **Notion API**:
    - Obtain a Notion integration token.
    - Set the `NOTION_TOKEN` token and `NOTION_DATABASE_ID` in the script.
