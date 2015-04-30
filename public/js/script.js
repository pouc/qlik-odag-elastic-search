/**
 * Create the module. Set it up to use html5 mode.
 */
window.angular4Elastic = angular.module('angular4Elastic', ['elasticsearch'],
    ['$locationProvider', function($locationProvider){
        $locationProvider.html5Mode(true);
    }]
);

/**
 * Create a service to power calls to Elasticsearch. We only need to
 * use the _search endpoint.
 */
angular4Elastic.factory('searchService',
    ['$q', 'esFactory', '$location', function($q, elasticsearch, $location){
        var client = elasticsearch({
            host: $location.host() + ":9200"
        });

        /**
         * Given a term and an offset, load another round of 10 searchResults.
         *
         * Returns a promise.
         */
        var search = function(term, offset){
            var deferred = $q.defer();
            var query = {
                "match": {
                    "_all": term
                }
            };

            client.search({
                "index": 'twitter',
                "type": 'twitter',
                "body": {
                    "size": 10,
                    "from": (offset || 0) * 10,
                    "query": query
                }
            }).then(function(result) {
                deferred.resolve(result);
            }, deferred.reject);

            return deferred.promise;
        };

        return {
            "search": search
        };
    }]
);

/**
 * Create a controller to interact with the UI.
 */
angular4Elastic.controller('searchController',
    ['searchService', '$scope', '$location', '$http', function(searchResults, $scope, $location, $http){
		
        // Provide some nice initial choices
        var initChoices = [
            "obama"
        ];
        var idx = Math.floor(Math.random() * initChoices.length);

        // Initialize the scope defaults.
        $scope.searchResults = [];        // An array of recipe results to display
        $scope.page = 0;            // A counter to keep track of our current page
        $scope.allResults = false;  // Whether or not all results have been found.

        // And, a random search term to start if none was present on page load.
        $scope.searchTerm = $location.search().q || initChoices[idx];

        /**
         * A fresh search. Reset the scope variables to their defaults, set
         * the q query parameter, and load more results.
         */
        $scope.search = function(){
            $scope.page = 0;
            $scope.searchResults = [];
            $scope.allResults = false;
            $location.search({'q': $scope.searchTerm});
            $scope.loadMore();
        };
		
		$scope.goToSense = function(){
            window.location.href = '/createSenseApp?q=' + $scope.searchTerm;
        };

        /**
         * Load the next page of results, incrementing the page counter.
         * When query is finished, push results onto $scope.searchResults and decide
         * whether all results have been returned (i.e. were 10 results returned?)
         */
        $scope.loadMore = function(){
            searchResults.search($scope.searchTerm, $scope.page++).then(function(results){
                if(results.hits.hits.length !== 10){
                    $scope.allResults = true;
                }
				
				//angular.forEach(results.hits.hits, function(index) {
					//$http.get('/getProfile?id=' + index._source.user).success(function(data) {
					//	index['profilePicture'] = data.profile_image_url;
					//});
					//index['profilePicture'] = 'http://avatars.io/twitter/' + index._source.user;
				//});
				
				if($scope.page > 1) {
					$scope.searchResults.hits.hits = $scope.searchResults.hits.hits.concat(results.hits.hits);
					$scope.searchResults.hits.total = results.hits.total;
					$scope.searchResults.took = results.took;
				} else {
					$scope.searchResults = results;
				}
            });
        };

        // Load results on first run
        $scope.loadMore();
    }]
);
