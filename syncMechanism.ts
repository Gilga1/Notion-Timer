import { BehaviorSubject } from 'rxjs';
import axios from 'axios';

// Define initialData according to your application structure
const initialData = { name: "", otherProperties: {} }; // Modify as per your actual data structure

const notionAPIUrl = 'https://api.notion.com/v1/...'; // Your actual endpoint
const notionToken = 'your_notion_integration_token'; // Store securely

const notionClient = axios.create({
    baseURL: notionAPIUrl,
    headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2021-05-13', // Use correct Notion version
    },
});

const temporaryDB = new BehaviorSubject(initialData);

const updateData = (newData) => {
    temporaryDB.next(newData);
};

const syncWithNotion = async (data) => {
    try {
        const response = await notionClient.post('/pages', {
            parent: { database_id: 'your_database_id' },  // Replace with your actual database ID
            properties: {
                Name: { title: [{ text: { content: data.name }}] },
                // Add other properties as needed
            },
        });
        console.log('Data synced successfully:', response.data);
    } catch (error) {
        console.error('Sync failed:', error);
    }
};

temporaryDB.subscribe((data) => {
    syncWithNotion(data);
});