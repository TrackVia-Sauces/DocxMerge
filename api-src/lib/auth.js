var request = require('request');

/**
 * Singleton service for handling authentication and api keys
 */

class Auth {
    setUserKey(userKey) {
        this.userKey = userKey;
    }
    getUserKey() {
        return this.userKey;
    }

    setAccessToken(token) {
        this.accessToken = token;
    }
    getAccessToken() {
        return this.accessToken;
    }

    setRefreshToken(refreshToken, secondsUntilExpiration) {
        this.refreshToken = refreshToken;
        if(typeof secondsUntilExpiration !== 'number') {
            var secondsUntilExpiration = parseInt(secondsUntilExpiration);
        }

        if(this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }

        // Refresh token 15 seconds before it expires
        this.refreshTimer = setTimeout(() => {
            this.doRefreshToken();
        }, (secondsUntilExpiration - 15) * 1000);
    }

    doRefreshToken() {
        var params = {
            client_id: 'TrackViaAPI',
            grant_type: 'refresh_token',
            refresh_token: this.refreshToken
        };

        var requestDetails = {
            url: __tv_host + '/oauth/token',
            method: 'POST',
            form: params
        };

        return new Promise((resolve, reject) => {
            request(requestDetails, (err, res, body) => {
                if(err) {
                    reject(err);
                }

                var data = JSON.parse(body);
                if(data.access_token) {
                    this.setAccessToken(data.access_token);
                    this.setRefreshToken(data.refresh_token, data.expires_in);
                } else {
                    throw new Error('Access Token not returned from login');
                }
            });
        });
    }
}

module.exports = new Auth();