// Site analytics
var _qaRef = null;
function _qa(e, d) {
	try {
		if (!_qaRef) _qaRef = window[['u','m','a','m','i'].join('')];
		if (_qaRef) d ? _qaRef.track(e, d) : _qaRef.track(e);
	} catch(x){}
}
(function() {
	var s = document.createElement('script');
	s.defer = true;
	s.src = 'https://um.serilum.com/script.js';
	s.setAttribute('data-website-' + 'id', '656d0358-8a94-486a-b56e-7a44ae6fd917');
	s.setAttribute('data-do' + 'mains', 'mcmodding.dev');
	document.head.appendChild(s);
})();

$(function() {
	$(".loadingwrapper").fadeIn(400).delay(400).fadeOut(400);
	$(".mainwrapper").delay(600).fadeIn(500);

	$(".card-btn").on("click", function() {
		_qa("browse_events");
	});
});
