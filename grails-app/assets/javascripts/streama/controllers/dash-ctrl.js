'use strict';

angular.module('streama').controller('dashCtrl',
	function ($scope, $state, $rootScope, localStorageService, modalService, $stateParams, mediaListService, currentUser,
            Dash, Profile, Tag, Settings, WatchlistEntry, ViewingStatus ) {
  var vm = this;

    var LIST_MAX = 30;
    vm.showDetails = showDetails;
    vm.handleWatchlistUpdate = handleWatchlistUpdate;
    vm.loadingRecommendations = true;
    vm.isDashSectionHidden = isDashSectionHidden;
    vm.isDashType = isDashType;

    $scope.$on('changedGenre', onChangedGenre);
    $scope.$on('video.updateWatchlist', onVideoUpdateWatchlist);

    init();

    function init() {
      if ($rootScope.currentUser.isAdmin) {
        showInitialSettingsWarning();
      }
      if ($stateParams.mediaModal) {
        modalService.mediaDetailModal({mediaId: $stateParams.mediaModal, mediaType: $stateParams.mediaType, isApiMovie: false});
      }

      if(!localStorageService.get('currentProfile')){
        Profile.getUserProfiles().$promise.then(function(response) {
            var data = response;
            localStorageService.set('currentProfile', data[0]);
            initMedia();
          }
        , function (data) {
          alertify.error(data.message);
        });
      } else {
        initMedia();
      }
    }

    function initMedia() {
      if(isDashType("home") || isDashType("discover-movies")){
        vm.movie = mediaListService.init(Dash.listMovies, {sort: 'title', order: 'ASC'}, currentUser);
      }
      if(isDashType("home") || isDashType("discover-shows")){
        vm.tvShow = mediaListService.init(Dash.listShows, {sort: 'name', order: 'ASC'}, currentUser);
      }
      if(isDashType("home") || isDashType("watchlist")){
        vm.watchlistEntry = mediaListService.init(WatchlistEntry.list, {sort: 'id', order: 'DESC'}, currentUser);
      }
      if(isDashType("home")){
        vm.genericVideo = mediaListService.init(Dash.listGenericVideos, {sort: 'title', order: 'ASC'}, currentUser);
        Dash.listNewReleases().$promise.then(onNewReleasesLoaded);
        Dash.listContinueWatching().$promise.then(onContinueWatchingLoaded);
        Dash.listRecommendations().$promise.then(onRecommendedLoaded);
      }

      Dash.listGenres().$promise.then(onGenreLoaded);
      Tag.list().$promise.then(onTagsLoaded);
    }


    function isDashType(type) {
      return ($state.params.dashType === type || (type === 'home' && !$state.params.dashType));
    }
    // HOISTED FUNCTIONS BELOW

    function onRecommendedLoaded(response) {
      var data = response.data;
      vm.recommendations = data;
      vm.loadingRecommendations = false;
    }

    function fetchData(mediaConfig) {
      mediaConfig.fetch({max: LIST_MAX, offset: mediaConfig.currentOffset, sort: mediaConfig.currentSort.sort, order: mediaConfig.currentSort.order}).then(function (response) {
        var data = response.data;
        mediaConfig.total = data.total;
        if(mediaConfig.currentOffset > 0){
          mediaConfig.list = _.unionBy(mediaConfig.list, data.list, 'id');
        }else{
          mediaConfig.list = data.list;
        }
        mediaConfig.isLoading = false;
      });
    }

    function onContinueWatchingLoaded(response) {
      var data = response.data;
      vm.continueWatching = data;
    }

    function onNewReleasesLoaded(response) {
      var data = response.data;
      vm.newReleases = data;
    }

    function onTagsLoaded(response) {
      var data = response.data;
      vm.tags = data;
    }

    function onGenreLoaded(response) {
      var data = response.data;
      $rootScope.genres = data;

      if ($stateParams.genreId) {
        $rootScope.selectedGenre = _.find(data, {id: parseInt($stateParams.genreId)});
        vm.movie.filter.genre = [$rootScope.selectedGenre];
        vm.tvShow.filter.genre = [$rootScope.selectedGenre];
      }
    }

    function showInitialSettingsWarning() {
      var settingsPromise = Settings.list().$promise;
      settingsPromise.then(function (response) {
        var data = response;
        $scope.settings = data;
        var TheMovieDbAPI = _.find(data, {settingsKey: 'Upload Directory'});

        if (!TheMovieDbAPI.value) {
          alertify.alert('You need to fill out some required base-settings. You will be redirected to the settings page now.', function () {
            $state.go('settings.settings');
          });
        }
      });
      return settingsPromise;
    }

    function onChangedGenre(e, genre) {
      $rootScope.selectedGenre = genre;
      var genreFilter;
      if ($rootScope.selectedGenre) {
        genreFilter = [$rootScope.selectedGenre.id];
      } else {
        genreFilter = [];
      }
      vm.movie.filter.genre = genreFilter;
      vm.tvShow.filter.genre = genreFilter;
      vm.movie.setFilter();
      vm.tvShow.setFilter();
    }

    function showDetails(media) {
      if(media.mediaType === 'episode'){
        modalService.mediaDetailModal({mediaId: media.tvShowId, mediaType: 'tvShow', isApiMovie: false});
      }else{
        modalService.mediaDetailModal({mediaId: media.id, mediaType: media.mediaType, isApiMovie: false}, function (response) {
          updateWatchlist(response.action, _.get(vm.watchlistEntry, 'list'), media, response.watchlistEntry);
        });
      }
    }

    function handleWatchlistUpdate(action, item){
      switch (action) {
        case "added":
          addToWatchlist(item);
          break;
        case "removed":
          removeFromWatchlist(item);
          break;
      }
    }

    function addToWatchlist(item) {
      WatchlistEntry.create({id: item.id, mediaType: item.mediaType}).$promise.then(function (response) {
        vm.watchlistEntry.list = vm.watchlistEntry.list ? vm.watchlistEntry.list : [];
        updateWatchlist("added", _.get(vm.watchlistEntry, 'list'), item, response);
      });
    }

    function removeFromWatchlist(item) {
      vm.watchlistEntry.list = vm.watchlistEntry.list ? vm.watchlistEntry.list : [];
      alertify.set({buttonReverse: true, labels: {ok: "Yes", cancel: "Cancel"}});
      alertify.confirm("Are you sure you want to remove this video from your watchlist?", function (confirmed) {
        if (confirmed) {
          WatchlistEntry.delete({id: item.id, mediaType: item.mediaType}).$promise.then(function (response) {
            updateWatchlist("removed", _.get(vm.watchlistEntry, 'list'), item);
          });
        }
      });
    }

    function updateWatchlist(action, list, media, watchlistEntry) {
      var type = handleVideoListsUpdate(media);
      if(action === 'added'){
        list.push(watchlistEntry);
        alertify.success('The '+type+' was added to your watchlist.');
      }else if (action === 'removed'){
        removeMediaFromList(list, media);
        alertify.success('The '+type+' was removed from your watchlist.');
      }
      list.sort(function(a,b) { return (a.id < b.id) ? 1 : ((a.id > b.id) ? -1 : 0)});
    }

    function removeMediaFromList(list, media){
      _.remove(list, function (watchlistEntry) {
        return (watchlistEntry.video ? watchlistEntry.video.id : watchlistEntry.tvShow.id) === media.id
      });
    }

    function handleVideoListsUpdate(media){
      var type = media.mediaType;
      switch (type) {
        case "tvShow":
          watchlistStatusHandler(vm.tvShow.list, media);
          type = "show";
          break;
        case "movie":
          watchlistStatusHandler(vm.movie.list, media);
          type = 'movie';
          break;
        case "genericVideo":
          watchlistStatusHandler(vm.genericVideo.list, media);
          type = 'video';
          break;
        default:
          break;
      }
      watchlistStatusHandler(vm.newReleases, media);
      watchlistStatusHandler(vm.continueWatching, media);
      return type
    }

    function watchlistStatusHandler(mediaList, item){
      var index = _.findIndex(mediaList, function(element) { return item.id === element.id});
      if(index > 0){
        mediaList[index].inWatchlist = !mediaList[index].inWatchlist
      }
    }

    function applyFilter(item, filterObj) {
      var showItemArray = [];

      _.forEach(filterObj, function (filterVal, key) {
        if (_.isArray(filterVal) && filterVal.length) {
          var intersection = _.intersectionBy(item[key], filterVal, 'id');
          var isVisible = (intersection.length ? true : false);
          showItemArray.push(isVisible);
        }
        if (_.isString(filterVal) && filterVal.length >= 1) {
          var isVisible = (_.includes(item[key].toLowerCase(), filterVal.toLowerCase()) ? true : false);
          showItemArray.push(isVisible);
        }
      });

      return (showItemArray.indexOf(false) < 0);
    }

    function isDashSectionHidden(sectionName) {
      var hiddenDashSectionSetting = _.find($scope.settings, {name: 'hidden_dash_sections'});
      if(_.get(hiddenDashSectionSetting, 'parsedValue')){
        var hiddenDashSections = hiddenDashSectionSetting.parsedValue.split(',');
        return (hiddenDashSections.indexOf(sectionName) > -1);
      }
    }

    function onVideoUpdateWatchlist(e, data) {
      vm.watchlistEntry.list = vm.watchlistEntry.list ? vm.watchlistEntry.list : [];
      updateWatchlist(data.action, _.get(vm.watchlistEntry, 'list'), data.media, _.get(data.response, 'data'));
    }

	});
