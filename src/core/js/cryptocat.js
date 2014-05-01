if (typeof Cryptocat === 'undefined') { Cryptocat = function() {} }

/*
-------------------
GLOBAL VARIABLES
-------------------
*/

Cryptocat.version = '2.1.23' // Version number

Cryptocat.me = {
	login:         'cryptocat',
	newMessages:   0,
	windowFocus:   true,
	typing:        false,
	conversation:  null,
	nickname:      null,
	otrKey:        null,
	fileKey:       null,
	mpPrivateKey:  null,
	mpPublicKey:   null,
	mpFingerprint: null,
	currentBuddy:  null
}

Cryptocat.buddies = {}

Cryptocat.audioExt = '.mp3'
if (navigator.userAgent.match(/(OPR)|(Firefox)/)) {
	Cryptocat.audioExt = '.ogg' //
}
Cryptocat.sounds = {
	'keygenStart': (new Audio('snd/keygenStart' + Cryptocat.audioExt)),
	'keygenLoop':  (new Audio('snd/keygenLoop'  + Cryptocat.audioExt)),
	'keygenEnd':   (new Audio('snd/keygenEnd'   + Cryptocat.audioExt)),
	'userLeave':   (new Audio('snd/userLeave'   + Cryptocat.audioExt)),
	'userJoin':    (new Audio('snd/userJoin'    + Cryptocat.audioExt)),
	'msgGet':      (new Audio('snd/msgGet'      + Cryptocat.audioExt)),
	'balloon':     (new Audio('snd/balloon'     + Cryptocat.audioExt))
}

/*
-------------------
END GLOBAL SCOPE
-------------------
*/

if (typeof(window) !== 'undefined') { $(window).ready(function() {
'use strict';

/*
-------------------
INTIALIZATION
-------------------
*/

// Set version number in UI.
$('#version').text(Cryptocat.version)

// Seed RNG.
Cryptocat.random.setSeed(Cryptocat.random.generateSeed())

var conversationBuffers = {}

// Load favicon notification settings.
Tinycon.setOptions({
	colour: '#FFFFFF',
	background: '#76BDE5'
})

/*
-------------------
GLOBAL INTERFACE FUNCTIONS
-------------------
*/

// Update a file transfer progress bar.
Cryptocat.updateFileProgressBar = function(file, chunk, size, recipient) {
	var progress = (chunk * 100) / (Math.ceil(size / Cryptocat.otr.chunkSize))
	if (progress > 100) { progress = 100 }
	$('[file=' + file + '] .fileProgressBarFill').animate({'width': progress + '%'})
	var conversationBuffer = $(conversationBuffers[Cryptocat.buddies[recipient].id])
	conversationBuffer.find('[file=' + file + '] .fileProgressBarFill').width(progress + '%')
	conversationBuffers[Cryptocat.buddies[recipient].id] = $('<div>').append($(conversationBuffer).clone()).html()
}

// Convert Data blob/url to downloadable file, replacing the progress bar.
Cryptocat.addFile = function(url, file, conversation, filename) {
	var conversationBuffer = $(conversationBuffers[Cryptocat.buddies[conversation].id])
	var fileLinkString = 'fileLink'
	if (navigator.userAgent === 'Chrome (Mac app)') {
		fileLinkString += 'Mac'
	}
	var fileLink = Mustache.render(Cryptocat.templates[fileLinkString], {
		url: url,
		filename: filename,
		downloadFile: Cryptocat.locale['chatWindow']['downloadFile']
	})
	$('[file=' + file + ']').replaceWith(fileLink)
	conversationBuffer.find('[file=' + file + ']').replaceWith(fileLink)
	conversationBuffers[conversation] = $('<div>').append($(conversationBuffer).clone()).html()
}

// Signal a file transfer error in the UI.
Cryptocat.fileTransferError = function(sid) {
	$('[file=' + sid + ']').animate({
		'borderColor': '#F00'
	})
	$('[file=' + sid + ']').find('.fileProgressBarFill').animate({
		'background-color': '#F00'
	})
}

// Add a `message` from `nickname` to the `conversation` display and log.
// `type` can be 'file', 'composing', 'message', 'warning' or 'missingRecipients'.
// In case `type` === 'missingRecipients', `message` becomes array of missing recipients.
Cryptocat.addToConversation = function(message, nickname, conversation, type) {
	var lineDecoration = 2
	if (nickname === Cryptocat.me.nickname) {
		lineDecoration = 1
	}
	else if (Cryptocat.buddies[nickname].ignored) {
		return false
	}
	initializeConversationBuffer(conversation)
	if (type === 'file') {
		if (!message.length) { return false }
		if (nickname !== Cryptocat.me.nickname) {
			if (Cryptocat.audioNotifications) { Cryptocat.sounds.msgGet.play() }
			desktopNotification(
				'img/keygen.gif', nickname + ' @ ' + Cryptocat.me.conversation, message, 0x1337
			)
		}
		message = Mustache.render(Cryptocat.templates.file, { message: message })
	}
	if (type === 'composing') {
		if ($('#composing-' + Cryptocat.buddies[nickname].id).length) { return true }
		message = Mustache.render(
			Cryptocat.templates.composing, {
				id: 'composing-' + Cryptocat.buddies[nickname].id
			}
		)
	}
	if (type === 'message') {
		if (!message.length) { return false }
		if (nickname !== Cryptocat.me.nickname) {
			if (Cryptocat.audioNotifications) { Cryptocat.sounds.msgGet.play() }
			desktopNotification(
				'img/keygen.gif', nickname + ' @ ' + Cryptocat.me.conversation, message, 0x1337
			)
		}
		message = Strophe.xmlescape(message)
		message = Cryptocat.addLinks(message)
		message = addEmoticons(message)
		if (message.match(Cryptocat.me.nickname)) { lineDecoration = 3 }
	}
	if (type === 'warning') {
		lineDecoration = 4
		if (!message.length) { return false }
		if (nickname !== Cryptocat.me.nickname) {
			if (Cryptocat.audioNotifications) { Cryptocat.sounds.msgGet.play() }
			desktopNotification(
				'img/keygen.gif', nickname + ' @ ' + Cryptocat.me.conversation, message, 0x1337
			)
		}
		message = Strophe.xmlescape(message)
	}
	if (type === 'missingRecipients') {
		if (!message.length) { return false }
		message = message.join(', ')
		message = Mustache.render(Cryptocat.templates.missingRecipients, {
			text: Cryptocat.locale.warnings.missingRecipientWarning
				.replace('(NICKNAME)', message),
			dir: Cryptocat.locale.direction
		})
		conversationBuffers[conversation] += message
		if (conversation === Cryptocat.me.currentBuddy) {
			if (
				(nickname === Cryptocat.me.nickname) ||
				!$('#composing-' + Cryptocat.buddies[nickname].id).length
			) {
				$('#conversationWindow').append(message)
			}
			else {
				$('#composing-' + Cryptocat.buddies[nickname].id).parent().before(message)
			}
			$('.missingRecipients').last().animate({'top': '0', 'opacity': '1'}, 100)
			scrollDownConversation(400, true)
		}
		return true
	}
	var authStatus = false
	if (
		(nickname === Cryptocat.me.nickname) ||
		Cryptocat.buddies[nickname].authenticated
	) {
		authStatus = true
	}
	message = message.replace(/:/g, '&#58;')
	var renderedMessage = Mustache.render(Cryptocat.templates.message, {
		lineDecoration: lineDecoration,
		nickname: shortenString(nickname, 16),
		currentTime: currentTime(true),
		authStatus: authStatus,
		message: message
	})
	if (type !== 'composing') {
		conversationBuffers[conversation] += renderedMessage
	}
	if (conversation === Cryptocat.me.currentBuddy) {
		if (
			(nickname === Cryptocat.me.nickname) ||
			!$('#composing-' + Cryptocat.buddies[nickname].id).length
		) {
			$('#conversationWindow').append(renderedMessage)
			$('.line' + lineDecoration).last().animate({'top': '0', 'opacity': '1'}, 100)
			bindSenderElement($('.line' + lineDecoration).last().find('.sender'))
		}
		else {
			var composingElement = $('#composing-' + Cryptocat.buddies[nickname].id)
			if (composingElement.length) {
				composingElement.parent().removeClass()
					.addClass('line' + lineDecoration)
				composingElement.replaceWith(message)
			}
		}
		scrollDownConversation(400, true)
	}
	else if (type !== 'composing') {
		$('#buddy-' + conversation).addClass('newMessage')
	}
}

// Show a preview for a received message from a buddy.
// Message previews will not overlap and are removed after 5 seconds.
Cryptocat.messagePreview = function(message, nickname) {
	var buddyElement = $('#buddy-' + Cryptocat.buddies[nickname].id)
	if (!buddyElement.attr('data-utip')) {
		if (message.length > 15) {
			message = message.substring(0, 15) + '..'
		}
		buddyElement.attr({
			'data-utip-gravity': 'sw',
			'data-utip': Strophe.xmlescape(message)
		}).mouseenter()
		window.setTimeout(function() {
			buddyElement.mouseleave()
			buddyElement.removeAttr('data-utip')
		}, 0x1337)
	}
}

// Handles login failures.
Cryptocat.loginFail = function(message) {
	$('#loginInfo').text(message)
	$('#bubble').animate({'left': '+=5px'}, 130)
		.animate({'left': '-=10px'}, 130)
		.animate({'left': '+=5px'}, 130)
	$('#loginInfo').animate({'background-color': '#E93028'}, 200)
}

// Handle detected new keys.
Cryptocat.removeAuthAndWarn = function(nickname) {
	var buddy = Cryptocat.buddies[nickname]
	var openAuth = false
	buddy.updateAuth(false)
	var errorAKE = Mustache.render(
		Cryptocat.templates.errorAKE, {
			nickname: nickname,
			errorText: Cryptocat.locale.auth.AKEWarning,
			openAuth: Cryptocat.locale.chatWindow.authenticate
		}
	)
	Cryptocat.dialogBox(errorAKE, {
		extraClasses: 'dialogBoxError',
		closeable: true,
		height: 250,
		onAppear: function() {
			$('#openAuth').unbind().bind('click', function() {
				openAuth = true
				$('#dialogBoxClose').click()
			})
		},
		onClose: function() {
			if (openAuth) {
				Cryptocat.displayInfo(nickname)
			}
		}
	})
}

// Buddy constructor
var Buddy = function(nickname, id) {
	this.id             = id
	this.ignored        = false
	this.fingerprint    = null
	this.authenticated  = false
	this.fileKey        = null
	this.mpPublicKey    = null
	this.mpFingerprint  = null
	this.mpSecretKey    = null
	this.nickname       = nickname
	this.genFingerState = null
	this.otr            = Cryptocat.otr.add(nickname)
}

Buddy.prototype = {
	constructor: Buddy,
	updateMpKeys: function(publicKey) {
		this.mpPublicKey = publicKey
		this.mpFingerprint = Cryptocat.multiParty.genFingerprint(this.nickname)
		this.mpSecretKey = Cryptocat.multiParty.genSharedSecret(this.nickname)
	},
	updateAuth: function(auth) {
		var nickname = this.nickname
		this.authenticated = auth
		if (auth) {
			$('#authenticated').attr('data-active', true)
			$('#notAuthenticated').attr('data-active', false)
		}
		else {
			$('#authenticated').attr('data-active', false)
			$('#notAuthenticated').attr('data-active', true)
		}
		$.each($('span').filterByData('sender', nickname),
			function(index, value) {
				$(value).find('.authStatus').attr('data-auth', auth)
			}
		)
		var authStatusBuffers = [
			'groupChat',
			Cryptocat.buddies[nickname].id
		]
		$.each(authStatusBuffers, function(i, thisBuffer) {
			var buffer = $(conversationBuffers[thisBuffer])
			$.each(buffer.find('span').filterByData('sender', nickname),
				function(index, value) {
					$(value).find('.authStatus').attr('data-auth', auth)
				}
			)
			conversationBuffers[thisBuffer] = $('<div>').append(
				buffer.clone()
			).html()
		})
	}
}

// Build new buddy.
Cryptocat.addBuddy = function(nickname, id) {
	if (!id) {
		id = getUniqueBuddyID()
	}
	var buddy = Cryptocat.buddies[nickname] = new Buddy(nickname, id)
	$('#buddyList').queue(function() {
		var buddyTemplate = Mustache.render(Cryptocat.templates.buddy, {
			buddyID: buddy.id,
			shortNickname: shortenString(nickname, 12)
		})
		$(buddyTemplate).insertBefore('#buddiesAway').slideDown(100, function() {
			$('#buddy-' + buddy.id)
				.unbind('click')
				.click(function() {
					Cryptocat.onBuddyClick($(this))
				}
			)
			$('#menu-' + buddy.id).attr('status', 'inactive')
				.unbind('click')
				.click(function(e) {
					e.stopPropagation()
					openBuddyMenu(nickname)
				}
			)
			buddyNotification(nickname, true)
		})
	})
	$('#buddyList').dequeue()
}

// Handle buddy going offline.
Cryptocat.removeBuddy = function(nickname) {
	var buddyID = Cryptocat.buddies[nickname].id
	var buddyElement = $('#buddy-' + buddyID)
	var composingElement = $('#composing-' + buddyID)
	delete Cryptocat.buddies[nickname]
	if (composingElement.length) {
		composingElement.parent().remove()
	}
	if (!buddyElement.length) {
		return
	}
	buddyElement.attr('status', 'offline')
	buddyNotification(nickname, false)
	if (Cryptocat.me.currentBuddy === buddyID) {
		return
	}
	if (!buddyElement.hasClass('newMessage')) {
		buddyElement.slideUp(500, function() {
			$(this).remove()
		})
	}
}

// Get a buddy's nickname from their ID.
Cryptocat.getBuddyNicknameByID = function(id) {
	for (var i in Cryptocat.buddies) {
		if (Cryptocat.buddies.hasOwnProperty(i)) {
			if (Cryptocat.buddies[i].id === id) {
				return i
			}
		}
	}
}

// Bind buddy click actions.
Cryptocat.onBuddyClick = function(buddyElement) {
	var nickname = Cryptocat.getBuddyNicknameByID(buddyElement.attr('data-id'))
	buddyElement.removeClass('newMessage')
	if (buddyElement.prev().attr('id') === 'currentConversation') {
		$('#userInputText').focus()
		return true
	}
	var id = buddyElement.attr('data-id')
	Cryptocat.me.currentBuddy = id
	initializeConversationBuffer(id)
	// Render conversation info bar.
	$('#groupConversation').text(nickname)
	if (Cryptocat.me.currentBuddy === 'groupChat') {
		$('#groupConversation').text(
			Cryptocat.locale['chatWindow']['groupConversation']
		)
	}
	// Switch currently active conversation.
	$('#conversationWindow').html(conversationBuffers[id])
	bindSenderElement()
	scrollDownConversation(0, false)
	$('#userInputText').focus()
	$('#buddy-' + id).addClass('currentConversation')
	// Clean up finished conversations.
	$('#buddyList div').each(function() {
		if ($(this).attr('data-id') !== id) {
			$(this).removeClass('currentConversation')
			if (
				!$(this).hasClass('newMessage') &&
				($(this).attr('status') === 'offline')
			) {
				$(this).slideUp(500, function() { $(this).remove() })
			}
		}
	})
	$('#conversationWindow').children().addClass('visibleLine')
}

// Close generating fingerprints dialog.
Cryptocat.closeGenerateFingerprints = function(nickname) {
	var state = Cryptocat.buddies[nickname].genFingerState
	Cryptocat.buddies[nickname].genFingerState = null
	$('#fill').stop().animate(
		{'width': '100%', 'opacity': '1'},
		400, 'linear',
		function() {
			$('#dialogBoxContent').fadeOut(function() {
				$(this).empty().show()
				if (state.close) {
					$('#dialogBoxClose').click()
				}
				state.cb()
			})
		}
	)
}

// Displays a pretty dialog box with `data` as the content HTML.
Cryptocat.dialogBox = function(data, options) {
	if (options.closeable) {
		$('#dialogBoxClose').css('width', 18)
		$('#dialogBoxClose').css('font-size', 12)
		$(document).keydown(function(e) {
			if (e.keyCode === 27) {
				e.stopPropagation()
				$('#dialogBoxClose').click()
				$(document).unbind('keydown')
			}
		})
	}
	if (options.extraClasses) {
		$('#dialogBox').addClass(options.extraClasses)
	}
	$('#dialogBoxContent').html(data)
	$('#dialogBox').css('height', options.height)
	$('#dialogBox').fadeIn(200, function() {
		if (options.onAppear) { options.onAppear() }
	})
	$('#dialogBoxClose').unbind('click').click(function(e) {
		e.stopPropagation()
		$(this).unbind('click')
		if ($(this).css('width') === 0) {
			return false
		}
		$('#dialogBox').fadeOut(100, function() {
			if (options.extraClasses) {
				$('#dialogBox').removeClass(options.extraClasses)
			}
			$('#dialogBoxContent').empty()
			$('#dialogBoxClose').css('width', '0')
			$('#dialogBoxClose').css('font-size', '0')
			if (options.onClose) { options.onClose() }
		})
		$('#userInputText').focus()
	})
}

// Display buddy information, including fingerprints and authentication.
Cryptocat.displayInfo = function(nickname) {
	var isMe = nickname === Cryptocat.me.nickname,
		infoDialog = isMe ? 'myInfo' : 'buddyInfo',
		chatWindow = Cryptocat.locale.chatWindow
	infoDialog = Mustache.render(Cryptocat.templates[infoDialog], {
		nickname: nickname,
		authenticated: Cryptocat.locale.auth.authenticated + ':',
		learnMoreAuth: Cryptocat.locale.auth.learnMoreAuth,
		otrFingerprint: chatWindow.otrFingerprint,
		groupFingerprint: chatWindow.groupFingerprint,
		authenticate: chatWindow.authenticate,
		verifyUserIdentity: chatWindow.verifyUserIdentity,
		secretQuestion: chatWindow.secretQuestion,
		secretAnswer: chatWindow.secretAnswer,
		ask: chatWindow.ask,
		identityVerified: chatWindow.identityVerified
	})
	ensureOTRdialog(nickname, false, function() {
		if (isMe) {
			Cryptocat.dialogBox(infoDialog, {
				height: 250,
				closeable: true
			})
		}
		else {
			var authTutorial = Mustache.render(Cryptocat.templates.authTutorial, {
				nickname: nickname,
				slide1: Cryptocat.locale.auth.authSlide1,
				slide2: Cryptocat.locale.auth.authSlide2,
				slide3: Cryptocat.locale.auth.authSlide3,
				slide4: Cryptocat.locale.auth.authSlide5
			})
			Cryptocat.dialogBox(infoDialog, {
				height: 430,
				closeable: true,
				onAppear: function() {
					$('#authTutorial').html(authTutorial)
				}
			})
			bindAuthDialog(nickname)
		}
		$('#otrFingerprint').text(getFingerprint(nickname, true))
		$('#multiPartyFingerprint').text(getFingerprint(nickname, false))
	})
}

// Executes on user logout.
Cryptocat.logout = function() {
	Cryptocat.loginError = false
	Cryptocat.xmpp.connection.muc.leave(
		Cryptocat.me.conversation + '@' + Cryptocat.xmpp.conferenceServer
	)
	Cryptocat.xmpp.connection.disconnect()
	document.title = 'Cryptocat'
	$('#conversationInfo,#optionButtons').fadeOut()
	$('#header').animate({'background-color': 'transparent'})
	$('.logo').animate({'margin': '-5px 5px 0 5px'})
	$('#buddyWrapper').slideUp()
	$('.buddy').unbind('click')
	$('.buddyMenu').unbind('click')
	$('#buddy-groupChat').insertAfter('#buddiesOnline')
	$('#userInput').fadeOut(function() {
		$('#logoText').fadeIn()
		$('#footer').animate({'height': 14})
		$('#conversationWrapper').fadeOut(function() {
			$('#info,#loginOptions,#version,#loginInfo').fadeIn()
			$('#login').fadeIn(200, function() {
				$('#login').css({opacity: 1})
				$('#conversationName').select()
				$('#loginSubmit,#conversationName,#nickname').removeAttr('readonly')
			})
			$('#dialogBoxClose').click()
			$('#buddyList div').each(function() {
				if ($(this).attr('id') !== 'buddy-groupChat') {
					$(this).remove()
				}
			})
			$('#conversationWindow').html('')
			for (var b in Cryptocat.buddies) {
				if (Cryptocat.buddies.hasOwnProperty(b)) {
					delete Cryptocat.buddies[b]
				}
			}
			conversationBuffers = {}
			Cryptocat.xmpp.connection = null
		})
	})
}

Cryptocat.prepareAnswer = function(answer, ask, buddyMpFingerprint) {
	var first, second
	answer = answer.toLowerCase().replace(/(\s|\.|\,|\'|\"|\;|\?|\!)/, '')
	if (buddyMpFingerprint) {
		first = ask ? Cryptocat.me.mpFingerprint : buddyMpFingerprint
		second = ask ? buddyMpFingerprint : Cryptocat.me.mpFingerprint
		answer += ';' + first + ';' + second
	}
	return answer
}

/*
-------------------
PRIVATE INTERFACE FUNCTIONS
-------------------
*/

// Outputs the current hh:mm.
// If `seconds = true`, outputs hh:mm:ss.
var currentTime = function(seconds) {
	var date = new Date()
	var time = []
	time.push(date.getHours().toString())
	time.push(date.getMinutes().toString())
	if (seconds) { time.push(date.getSeconds().toString()) }
	for (var just in time) {
		if (time[just].length === 1) {
			time[just] = '0' + time[just]
		}
	}
	return time.join(':')
}

// Initializes a conversation buffer. Internal use.
var initializeConversationBuffer = function(id) {
	if (!conversationBuffers.hasOwnProperty(id)) {
		conversationBuffers[id] = ''
	}
}

// Get a unique buddy identifier.
var getUniqueBuddyID = function() {
	var buddyID = Cryptocat.random.encodedBytes(16, CryptoJS.enc.Hex)
	for (var b in Cryptocat.buddies) {
		if (Cryptocat.buddies.hasOwnProperty(b)) {
			if (Cryptocat.buddies[b].id === buddyID) {
				return getUniqueBuddyID()
			}
		}
	}
	return buddyID
}

// Simply shortens a string `string` to length `length.
// Adds '..' to delineate that string was shortened.
var shortenString = function(string, length) {
	if (string.length > length) {
		return string.substring(0, (length - 2)) + '..'
	}
	return string
}

// Get a fingerprint, formatted for readability.
var getFingerprint = function(nickname, OTR) {
	var buddy = Cryptocat.buddies[nickname],
		isMe = nickname === Cryptocat.me.nickname,
		fingerprint

	if (OTR) {
		fingerprint = isMe
			? Cryptocat.me.otrKey.fingerprint()
			: fingerprint = buddy.fingerprint
	} else {
		fingerprint = isMe
			? Cryptocat.me.mpFingerprint
			: buddy.mpFingerprint
	}

	var formatted = ''
	for (var i in fingerprint) {
		if (fingerprint.hasOwnProperty(i)) {
			if ((i !== 0) && (i % 8) === 0) {
				formatted += ' '
			}
			formatted += fingerprint[i]
		}
	}
	return formatted.toUpperCase()
}

// Convert message URLs to links. Used internally.
Cryptocat.addLinks = function(message) {
	var sanitize
	var URLs = message.match(/((http(s?)\:\/\/){1}\S+)/gi)
	if (!URLs) { return message }
	for (var i = 0; i !== URLs.length; i++) {
		sanitize = URLs[i].split('')
		for (var l = 0; l !== sanitize.length; l++) {
			if (!sanitize[l].match(
				/\w|\d|\:|\/|\?|\=|\#|\+|\,|\.|\&|\;|\%/)
			) {
				sanitize[l] = encodeURIComponent(sanitize[l])
			}
		}
		sanitize = sanitize.join('')
		var url = sanitize.replace(':', '&colon;')
		if (navigator.userAgent === 'Chrome (Mac app)') {
			message = message.replace(
				sanitize, '<a href="' + url + '">' + url + '</a>'
			)
			continue
		}
		message = message.replace(
			sanitize, '<a href="' + url + '" target="_blank">' + url + '</a>'
		)
	}
	return message
}

// Convert text emoticons to graphical emoticons.
var addEmoticons = function(message) {
	var emoticons = {
		cry:                   /(\s|^)(:|(=))-?\&apos;\((?=(\s|$))/gi,
		unsure:               /(\s|^)(:|(=))-?(\/|s)(?=(\s|$))/gi,
		cat:                 /(\s|^)(:|(=))-?3(?=(\s|$))/gi,
		gasp:               /(\s|^)(:|(=))-?o(?=(\s|$))/gi,
		grin:              /(\s|^)(:|(=))-?D(?=(\s|$))/gi,
		sad:              /(\s|^)(:|(=))-?\((?=(\s|$))/gi,
		smile:           /(\s|^)(:|(=))-?\)(?=(\s|$))/gi,
		tongue:         /(\s|^)(:|(=))-?p(?=(\s|$))/gi,
		happy:         /(\s|^)\^(_|\.)?\^(?=(\s|$))/gi,
		shut:         /(\s|^)(:|(=))-?x\b(?=(\s|$))/gi,
		wink:        /(\s|^);-?\)(?=(\s|$))/gi,
		winkTongue: /(\s|^);-?\p(?=(\s|$))/gi,
		squint:    /(\s|^)-_-(?=(\s|$))/gi,
	}
	for (var e in emoticons) {
		if (emoticons.hasOwnProperty(e)) {
			message = message.replace(
				emoticons[e],
				Mustache.render(Cryptocat.templates.emoticon, {
					emoticon: e
				})
			)
		}
	}
	return message.replace(
		/(\s|^)\&lt\;3\b(?=(\s|$))/g,
		' <span class="monospace">&#9829;</span> '
	)
}

// Bind `nickname`'s authentication dialog buttons and options.
var bindAuthDialog = function(nickname) {
	var buddy = Cryptocat.buddies[nickname]
	if (Cryptocat.buddies[nickname].authenticated) {
		buddy.updateAuth(true)
	}
	else {
		buddy.updateAuth(false)
	}
	$('#authenticated').unbind('click').bind('click', function() {
		buddy.updateAuth(true)
	})
	$('#notAuthenticated').unbind('click').bind('click', function() {
		buddy.updateAuth(false)
	})
	// If the current locale doesn't have the translation
	// for the auth slides yet, then don't display the option
	// for opening the auth tutorial.
	// This is temporary until all translations are ready.
	// — Nadim, March 29 2014
	if (
		Cryptocat.locale.language !== 'en' &&
		Cryptocat.locale.auth.learnMoreAuth === 'Learn more about authentication') {
		$('#authLearnMore').hide()
	}
	$('#authLearnMore').unbind('click').bind('click', function() {
		if ($(this).attr('data-active') === 'true') {
			$('#authTutorial').fadeOut(function() {
				$('#authLearnMore').attr('data-active', 'false')
					.text(Cryptocat.locale.auth.learnMoreAuth)
				$('.authInfo').fadeIn()
			})
		}
		else {
			$('.authInfo').fadeOut(function() {
				$('#authLearnMore').attr('data-active', 'true')
					.text(Cryptocat.locale.chatWindow.cont)
				$('#authTutorial').fadeIn(function() {
					if ($('.bjqs-slide').length) {
						return
					}
					$('#authTutorialSlides').bjqs({
						width: 430,
						height: 230,
						animduration: 250,
						animspeed: 7000,
						responsive: true,
						nexttext: '>',
						prevtext: '<'
					})
				})
			})
		}
	})
	$('#authSubmit').unbind('click').bind('click', function(e) {
		e.preventDefault()
		var question = $('#authQuestion').val()
		var answer = $('#authAnswer').val()
		if (answer.length === 0) {
			return
		}
		$('#authSubmit').val(Cryptocat.locale.chatWindow.asking)
		$('#authSubmit').unbind('click').bind('click', function(e) {
			e.preventDefault()
		})
		buddy.updateAuth(false)
		answer = Cryptocat.prepareAnswer(answer, true, buddy.mpFingerprint)
		buddy.otr.smpSecret(answer, question)
	})
}

// Bind sender element to show authStatus information and timestamps.
var bindSenderElement = function(senderElement) {
	if (!senderElement) {
		senderElement = $('.sender')
	}
	senderElement.children().unbind('mouseenter,mouseleave,click')
	senderElement.find('.nickname').mouseenter(function() {
		$(this).text($(this).parent().attr('data-timestamp'))
	})
	senderElement.find('.nickname').mouseleave(function() {
		$(this).text($(this).parent().attr('data-sender'))
	})
	senderElement.find('.authStatus').mouseenter(function() {
		if ($(this).attr('data-auth') === 'true') {
			$(this).attr('data-utip', Cryptocat.locale.auth.authenticated)
		}
		else {
			$(this).attr('data-utip',
				Mustache.render(Cryptocat.templates.authStatusFalseUtip, {
					text: Cryptocat.locale.auth.userNotAuthenticated,
					learnMore: Cryptocat.locale.auth.clickToLearnMore
				})
			)
		}
		// This is pretty ugly, sorry! Feel free to clean up via pull request.
		var bgc = $(this).css('background-color')
		var boxShadow = bgc.replace('rgb', 'rgba')
			.substring(0, bgc.length - 1) + ', 0.3)'
		$(this).attr('data-utip-style', JSON.stringify({
			'width': 'auto',
			'max-width': '110px',
			'font-size': '11px',
			'background-color': bgc,
			'box-shadow': '0 0 0 2px ' + boxShadow
		}))
		$(this).attr('data-utip-click', 'Cryptocat.displayInfo()')
	})
	senderElement.find('.authStatus').click(function() {
		Cryptocat.displayInfo($(this).parent().attr('data-sender'))
	})
}

var desktopNotification = function(image, title, body, timeout) {
	Tinycon.setBubble(++Cryptocat.me.newMessages)
	if (!Cryptocat.desktopNotifications || Cryptocat.me.windowFocus) { return false }
	// Mac
	if (navigator.userAgent === 'Chrome (Mac app)') {
		var iframe = document.createElement('IFRAME')
		iframe.setAttribute('src', 'js-call:' + title + ':' + body)
		document.documentElement.appendChild(iframe)
		iframe.parentNode.removeChild(iframe)
		iframe = null
	}
	else {
		var notice = new Notification(title, { tag: 'Cryptocat', body: body, icon: image })
		if (timeout > 0) {
			window.setTimeout(function() {
				if (notice) { notice.cancel() }
			}, timeout)
		}
	}
}

// Add a join/part notification to the conversation window.
// If 'join === true', shows join notification, otherwise shows part.
var buddyNotification = function(nickname, join) {
	var status, audioNotification
	if (join) {
		status = Mustache.render(Cryptocat.templates.userJoin, {
			nickname: nickname,
			currentTime: currentTime(false)
		})
		audioNotification = 'userJoin'
	}
	else {
		status = Mustache.render(Cryptocat.templates.userLeave, {
			nickname: nickname,
			currentTime: currentTime(false)
		})
		audioNotification = 'userLeave'
	}
	initializeConversationBuffer('groupChat')
	conversationBuffers['groupChat'] += status
	if (Cryptocat.me.currentBuddy !== 'groupChat') {
		conversationBuffers[Cryptocat.me.currentBuddy] += status
	}
	$('#conversationWindow').append(status)
	scrollDownConversation(400, true)
	desktopNotification('img/keygen.gif',
		nickname + ' has ' + (join ? 'joined ' : 'left ')
		+ Cryptocat.me.conversation, '', 0x1337)
	if (Cryptocat.audioNotifications) {
		Cryptocat.sounds[audioNotification].play()
	}
}

// Send encrypted file.
var sendFile = function(nickname) {
	var sendFileDialog = Mustache.render(Cryptocat.templates.sendFile, {
		sendEncryptedFile: Cryptocat.locale['chatWindow']['sendEncryptedFile'],
		fileTransferInfo: Cryptocat.locale['chatWindow']['fileTransferInfo']
	})
	ensureOTRdialog(nickname, false, function() {
		Cryptocat.dialogBox(sendFileDialog, {
			height: 250,
			closeable: true
		})
		$('#fileSelector').change(function(e) {
			e.stopPropagation()
			if (this.files) {
				var file = this.files[0]
				var filename = Cryptocat.random.encodedBytes(16, CryptoJS.enc.Hex)
				filename += file.name.match(/\.(\w)+$/)[0]
				Cryptocat.buddies[nickname].otr.sendfile(filename)
				var key = Cryptocat.buddies[nickname].fileKey[filename]
				Cryptocat.otr.beginSendFile({
					file: file,
					filename: filename,
					to: nickname,
					key: key
				})
				;delete Cryptocat.buddies[nickname].fileKey[filename]
			}
		})
		$('#fileSelectButton').click(function() {
			$('#fileSelector').click()
		})
	})
}

// Scrolls down the chat window to the bottom in a smooth animation.
// 'speed' is animation speed in milliseconds.
// If `threshold` is true, we won't scroll down if the user
// appears to be scrolling up to read messages.
var scrollDownConversation = function(speed, threshold) {
	var scrollPosition = $('#conversationWindow')[0].scrollHeight
	scrollPosition -= $('#conversationWindow').scrollTop()
	if ((scrollPosition < 700) || !threshold) {
		$('#conversationWindow').stop().animate({
			scrollTop: $('#conversationWindow')[0].scrollHeight + 20
		}, speed)
	}
}

// If OTR fingerprints have not been generated, show a progress bar and generate them.
var ensureOTRdialog = function(nickname, close, cb) {
	var buddy = Cryptocat.buddies[nickname]
	if (nickname === Cryptocat.me.nickname || buddy.fingerprint) {
		return cb()
	}
	var progressDialog = '<div id="progressBar"><div id="fill"></div></div>'
	Cryptocat.dialogBox(progressDialog, {
		height: 250,
		closeable: true
	})
	$('#progressBar').css('margin', '70px auto 0 auto')
	$('#fill').animate({'width': '100%', 'opacity': '1'}, 10000, 'linear')
	// add some state for status callback
	buddy.genFingerState = { close: close, cb: cb }
	buddy.otr.sendQueryMsg()
}

// Open a buddy's contact list context menu.
var openBuddyMenu = function(nickname) {
	var buddy = Cryptocat.buddies[nickname],
		chatWindow = Cryptocat.locale.chatWindow,
		ignoreAction = chatWindow[buddy.ignored ? 'unignore' : 'ignore'],
		$menu = $('#menu-' + buddy.id),
		$buddy = $('#buddy-' + buddy.id)

	if ($menu.attr('status') === 'active') {
		$menu.attr('status', 'inactive')
		$menu.css('background-image', 'url("img/down.png")')
		$buddy.animate({'height': 15}, 190)
		$('#' + buddy.id + '-contents').fadeOut(200, function() {
			$(this).remove()
		})
		return
	}
	$menu.attr('status', 'active')
	$menu.css('background-image', 'url("img/up.png")')
	$buddy.delay(10).animate({'height': 130}, 180, function() {
		$buddy.append(
			Mustache.render(Cryptocat.templates.buddyMenu, {
				buddyID: buddy.id,
				sendEncryptedFile: chatWindow.sendEncryptedFile,
				displayInfo: chatWindow.displayInfo,
				ignore: ignoreAction
			})
		)
		var $contents = $('#' + buddy.id + '-contents')
		$contents.fadeIn(200)
		$contents.find('.option1').click(function(e) {
			e.stopPropagation()
			Cryptocat.displayInfo(nickname)
			$menu.click()
		})
		$contents.find('.option2').click(function(e) {
			e.stopPropagation()
			sendFile(nickname)
			$menu.click()
		})
		$contents.find('.option3').click(function(e) {
			e.stopPropagation()
			if (buddy.ignored) {
				$buddy.removeClass('ignored')
			} else {
				$buddy.addClass('ignored')
			}
			buddy.ignored = !buddy.ignored
			$menu.click()
		})
	})
}

// Check for nickname completion.
// Called when pressing tab in user input.
var nicknameCompletion = function(input) {
	var nickname, match, suffix
	for (nickname in Cryptocat.buddies) {
		if (Cryptocat.buddies.hasOwnProperty(nickname)) {
			try { match = nickname.match(input.match(/(\S)+$/)[0]) }
			catch(err) {}
			if (match) {
				if (input.match(/\s/)) { suffix = ' ' }
				else { suffix = ': ' }
				return input.replace(/(\S)+$/, nickname + suffix)
			}
		}
	}
}

/*
-------------------
USER INTERFACE BINDINGS
-------------------
*/

// Buttons:
// Status button.
$('#status').click(function() {
	var $this = $(this)
	if ($this.attr('src') === 'img/available.png') {
		$this.attr('src', 'img/away.png')
		$this.attr('title', Cryptocat.locale['chatWindow']['statusAway'])
		$this.attr('data-utip', Cryptocat.locale['chatWindow']['statusAway'])
		$this.mouseenter()
		Cryptocat.xmpp.currentStatus = 'away'
		Cryptocat.xmpp.sendStatus()
	}
	else {
		$this.attr('src', 'img/available.png')
		$this.attr('title', Cryptocat.locale['chatWindow']['statusAvailable'])
		$this.attr('data-utip', Cryptocat.locale['chatWindow']['statusAvailable'])
		$this.mouseenter()
		Cryptocat.xmpp.currentStatus = 'online'
		Cryptocat.xmpp.sendStatus()
	}
})

// My info button.
$('#myInfo').click(function() {
	Cryptocat.displayInfo(Cryptocat.me.nickname)
})

// Desktop notifications button.
$('#notifications').click(function() {
	var $this = $(this)
	if ($this.attr('src') === 'img/noNotifications.png') {
		$this.attr('src', 'img/notifications.png')
		$this.attr('title', Cryptocat.locale['chatWindow']['desktopNotificationsOn'])
		$this.attr('data-utip', Cryptocat.locale['chatWindow']['desktopNotificationsOn'])
		$this.mouseenter()
		Cryptocat.desktopNotifications = true
		Cryptocat.storage.setItem('desktopNotifications', 'true')
		if (window.webkitNotifications) {
			if (window.webkitNotifications.checkPermission()) {
				window.webkitNotifications.requestPermission(function() {})
			}
		}
	}
	else {
		$this.attr('src', 'img/noNotifications.png')
		$this.attr('title', Cryptocat.locale['chatWindow']['desktopNotificationsOff'])
		$this.attr('data-utip', Cryptocat.locale['chatWindow']['desktopNotificationsOff'])
		$this.mouseenter()
		Cryptocat.desktopNotifications = false
		Cryptocat.storage.setItem('desktopNotifications', 'false')
	}
})

// Audio notifications button.
$('#audio').click(function() {
	var $this = $(this)
	if ($this.attr('src') === 'img/noSound.png') {
		$this.attr('src', 'img/sound.png')
		$this.attr('title', Cryptocat.locale['chatWindow']['audioNotificationsOn'])
		$this.attr('data-utip', Cryptocat.locale['chatWindow']['audioNotificationsOn'])
		$this.mouseenter()
		Cryptocat.audioNotifications = true
		Cryptocat.storage.setItem('audioNotifications', 'true')
	}
	else {
		$this.attr('src', 'img/noSound.png')
		$this.attr('title', Cryptocat.locale['chatWindow']['audioNotificationsOff'])
		$this.attr('data-utip', Cryptocat.locale['chatWindow']['audioNotificationsOff'])
		$this.mouseenter()
		Cryptocat.audioNotifications = false
		Cryptocat.storage.setItem('audioNotifications', 'false')
	}
})

// Logout button.
$('#logout').click(function() {
	$('#loginInfo').text(Cryptocat.locale['loginMessage']['thankYouUsing'])
	$('#loginInfo').animate({'background-color': '#97CEEC'}, 200)
	Cryptocat.logout()
})

// Submit user input.
$('#userInput').submit(function() {
	var message = $.trim($('#userInputText').val())
	$('#userInputText').val('')
	if (!message.length) { return false }
	if (Cryptocat.me.currentBuddy !== 'groupChat') {
		Cryptocat.buddies[
			Cryptocat.getBuddyNicknameByID(Cryptocat.me.currentBuddy)
		].otr.sendMsg(message)
	}
	else if (Object.keys(Cryptocat.buddies).length) {
		var ciphertext = JSON.parse(Cryptocat.multiParty.sendMessage(message))
		var missingRecipients = []
		for (var i in Cryptocat.buddies) {
			if (typeof(ciphertext['text'][i]) !== 'object') {
				missingRecipients.push(i)
			}
		}
		if (missingRecipients.length) {
			Cryptocat.addToConversation(
				missingRecipients, Cryptocat.me.nickname,
				'groupChat', 'missingRecipients'
			)
		}
		Cryptocat.xmpp.connection.muc.message(
			Cryptocat.me.conversation + '@' + Cryptocat.xmpp.conferenceServer,
			null, JSON.stringify(ciphertext), null, 'groupchat', 'active'
		)
	}
	Cryptocat.addToConversation(
		message, Cryptocat.me.nickname,
		Cryptocat.me.currentBuddy, 'message'
	)
	return false
})

// User input key event detection.
// (Message submission, nick completion...)
$('#userInputText').keydown(function(e) {
	if (e.keyCode === 9) {
		e.preventDefault()
		var nickComplete = nicknameCompletion($(this).val())
		if (nickComplete) {
			$(this).val(nickComplete)
		}
	}
	else if (e.keyCode === 13) {
		e.preventDefault()
		$('#userInput').submit()
		Cryptocat.me.typing = false
		return true
	}
	var destination, type
	if (Cryptocat.me.currentBuddy === 'groupChat') {
		destination = null
		type = 'groupchat'
	}
	else {
		destination = Cryptocat.getBuddyNicknameByID(Cryptocat.me.currentBuddy)
		type = 'chat'
	}
	if (!Cryptocat.me.typing) {
		Cryptocat.me.typing = true
		Cryptocat.xmpp.connection.muc.message(
			Cryptocat.me.conversation + '@' + Cryptocat.xmpp.conferenceServer,
			destination, '', null, type, 'composing'
		)
		window.setTimeout(function(d, t) {
			Cryptocat.xmpp.connection.muc.message(
				Cryptocat.me.conversation + '@' + Cryptocat.xmpp.conferenceServer,
				d, '', null, t, 'paused'
			)
			Cryptocat.me.typing = false
		}, 7000, destination, type)
	}
})

$('#userInputText').keyup(function(e) {
	if (e.keyCode === 13) {
		e.preventDefault()
	}
})

$('#userInputSubmit').click(function() {
	$('#userInput').submit()
	$('#userInputText').select()
})

// Language selector.
$('#languageSelect').click(function() {
	$('#customServerDialog').hide()
	$('#languages li').css({'color': '#FFF', 'font-weight': 'normal'})
	$('[data-locale=' + Cryptocat.locale['language'] + ']').css({
		'color': '#97CEEC',
		'font-weight': 'bold'
	})
	$('#footer').animate({'height': 190}, function() {
		$('#languages').fadeIn()
	})
	$('#languages li').click(function() {
		var lang = $(this).attr('data-locale')
		$('#languages').fadeOut(200, function() {
			Cryptocat.locale.set(lang, true)
			Cryptocat.storage.setItem('language', lang)
			$('#footer').animate({'height': 14})
		})
	})
})

// Login form.
$('#conversationName').click(function() {
	$(this).select()
})
$('#nickname').click(function() {
	$(this).select()
})
$('#cryptocatLogin').submit(function() {
	// Don't submit if form is already being processed.
	if (($('#loginSubmit').attr('readonly') === 'readonly')) {
		return false
	}
	//Check validity of conversation name and nickname.
	$('#conversationName').val($.trim($('#conversationName').val().toLowerCase()))
	$('#nickname').val($.trim($('#nickname').val().toLowerCase()))
	if ($('#conversationName').val() === '') {
		Cryptocat.loginFail(Cryptocat.locale['loginMessage']['enterConversation'])
		$('#conversationName').select()
	}
	else if (!$('#conversationName').val().match(/^\w{1,20}$/)) {
		Cryptocat.loginFail(Cryptocat.locale['loginMessage']['conversationAlphanumeric'])
		$('#conversationName').select()
	}
	else if ($('#nickname').val() === '') {
		Cryptocat.loginFail(Cryptocat.locale['loginMessage']['enterNickname'])
		$('#nickname').select()
	}
	else if (!$('#nickname').val().match(/^\w{1,16}$/)) {
		Cryptocat.loginFail(Cryptocat.locale['loginMessage']['nicknameAlphanumeric'])
		$('#nickname').select()
	}
	// If no encryption keys, prepare keys before connecting.
	else if (!Cryptocat.me.otrKey) {
		$('#loginSubmit,#conversationName,#nickname').attr('readonly', 'readonly')
		Cryptocat.xmpp.showKeyPreparationDialog(function() {
			Cryptocat.xmpp.connect()
		})
	}
	// If everything is okay, then log in anonymously.
	else {
		$('#loginSubmit,#conversationName,#nickname').attr('readonly', 'readonly')
		Cryptocat.xmpp.connect()
	}
	return false
})

/*
-------------------
KEYBOARD SHORTCUTS
-------------------
*/

// Select previous buddy
Mousetrap.bind('ctrl+1', function() {
	var prev = $('.currentConversation').prevAll('.buddy')
	prev.length ? prev[0].click() : $('.buddy').last().click()
})

// Select next buddy
Mousetrap.bind('ctrl+2', function() {
	var next = $('.currentConversation').nextAll('.buddy')
	next.length ? next[0].click() : $('.buddy').first().click()
})

// ???
Mousetrap.bind('up up down down left right left right b a enter', function() {
	if (Cryptocat.sounds.balloon.loop) {
		window.clearInterval(Cryptocat.balloon)
		Cryptocat.sounds.balloon.pause()
		Cryptocat.sounds.balloon.loop = false
		return
	}
	window.setTimeout(function() {
		Cryptocat.sounds.balloon.loop = true
		Cryptocat.sounds.balloon.play()
	}, 200)
	Cryptocat.balloon = window.setInterval(function() {
		$('<img/>').addClass('balloon')
		.attr('src', 'img/balloon.gif')
		.appendTo('body')
		.css({
			left: Math.round(
				Math.random() * ($(window).width() - 200) + 100
			)
		})
		.animate(
			{bottom: '2000'},
			25000 + Math.round(Math.random() * 8000),
			'linear',
			function() {
				$(this).remove()
			}
		)
	}, 999 + Math.round(Math.random() * 999))
})

/*
-------------------
WINDOW EVENT BINDINGS
-------------------
*/

// When the window/tab is not selected, set `windowFocus` to false.
// `windowFocus` is used to know when to show desktop notifications.
$(window).blur(function() {
	Cryptocat.me.windowFocus = false
})

// On window focus, select text input field automatically if we are chatting.
// Also set `windowFocus` to true.
$(window).focus(function() {
	Cryptocat.me.windowFocus = true
	Cryptocat.me.newMessages = 0
	Tinycon.setBubble()
	if ($('#buddy-groupChat').attr('status') === 'online') {
		$('#userInputText').focus()
	}
})

// Determine whether we are showing margins
// Depending on window size
$(window).resize(function() {
	if (
		$(window).height() < 595 ||
		$(window).width()  < 780
	) {
		$('#bubbleWrapper').css('margin', '1%')
	}
	else {
		$('#bubbleWrapper').css('margin', '1.5% auto 0 auto')
	}
})
$(window).resize()

// Show main window.
$('#bubble').show()

/*
$('#bubbleWrapper').css(
	{
		height: '538px'
	}
).animate(
	{
		'width': '+=500px'
	},
	700,
	function() {
		$('#av').animate(
			{
				'width': '480px'
			},
			700
		)
	}
)
*/


})}//:3
