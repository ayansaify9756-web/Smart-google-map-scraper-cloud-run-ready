const axios = require('axios');

const testScraper = async () => {
  try {
    const response = await axios.post('http://localhost:3000/scrape', {
      city: 'Delhi',
      keyword: 'dentist',
      areas: ['Saket', 'Rohini'],
    });

    console.log('Scraping successful!');
    console.log('Results:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error during testing:', error.response ? error.response.data : error.message);
  }
};

testScraper();
