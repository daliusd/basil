const axios = require('axios');

export const makeRequest = async (url: string) => {
    return await axios.get(url, {
        responseType: 'arraybuffer',
    });
};

export const makeAuthRequest = async (url: string, token: string) => {
    let config = {
        headers: { Authorization: `Bearer ${token}` },
    };

    return await axios.get(url, config);
};
