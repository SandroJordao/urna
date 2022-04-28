/**
 * JS Document. 
 * @author Sandro Jordão.
 */

let screen = 'loading'
let len_numbers = 0
let numbers = []
let current = 0
let inputs
let is_vote_blank = false
let is_vote_null = false

/* DELETAR */
let num_branco = 0
let num_nulo = 0

/**
 * 
 */
$(document).ready(() => {
	inputs = $(".input")
	len_numbers = inputs.length
	$("#screen-" + screen).show()

	inputAnimate()

	$(".bnt").click(function () { 
		clickNumber($(this).attr("data-valor")) 
	})

	$("#btn-branco").click(clickBlank)
	$("#btn-corrige").click(clickCorrect)
	$("#btn-confirma").click(clickConfirm)
	$("#btn-reset").click(reset)

	setTimeout(() => {
		screenTransition('valid')
	}, 1000) 
});

const inputAnimate = () => {
	inputs.removeClass('input-animate')
	$(inputs[current]).addClass('input-animate')
}

const clickNumber = (number) => {
	if (screen == 'end') return false
	if (len_numbers < (current + 1)) return false
	$(inputs[current]).val(number)
	current++
	inputAnimate()
	numbers.push(number)
	if (len_numbers == current) validVote()
}

const clickBlank = () => {
	if (screen == 'end') return false

	screenTransition('blank')
}

const clickCorrect = () => {
	if (screen == 'end') return false

	inputs.each(function() {
		$(this).val('')
	})

	current = 0
	numbers = []
	inputAnimate()

	$(".visible").removeClass('show').addClass('hidden')

	if (screen != 'valid') screenTransition('valid')
}

const clickConfirm = () => {
	if (screen == 'end') return false

	/* Refatorar Aqui ... */
	if (screen == 'blank') {
		num_branco++
		$("#number-branco").html(num_branco)
	} else if (screen == 'null') {
		num_nulo++
		$("#number-nulo").html(num_nulo)
	} else if (screen == 'valid' && len_numbers == current) {
		let office = numbers.join('')
		$("#number-" + office).html( parseInt($("#number-" + office).html()) + 1 )
	}
	/* *** */

	screenTransition('loading')
	setTimeout(() => { screenTransition('end') }, 1000)
}

const screenTransition = (show, callback) => {
	callback = (typeof callback == 'function') ? callback : () => false;
	$("#screen-" + screen).hide('fade', 300, () => {
		callback()
		$("#screen-" + show).show('fade', 200)
		screen = show
	})
}

const validVote = () => {
	let office = numbers.join('')

	if (!$("#office-" + office).length) {
		screenTransition('null', setInputNumbersNull)
	} else {
		setDataVoteValid()
	}
}

const setInputNumbersNull = () => {
	let idx = 0
	$(".input-null").each(function () {
		$(this).val(numbers[idx])
		idx++
	})
}

const setDataVoteValid = () => {
	let office = numbers.join('')
	var name = $("#office-" + office).attr('data-name')
	var image = $("#office-" + office).attr('data-image')
	var vice_name = $("#office-" + office).attr('data-vice-name')
	var vice_image = $("#office-" + office).attr('data-vice-image')

	$(".visible").removeClass('hidden').addClass('show')

	$("#office-name").html(name)
	$("#office-img").html('<img src="img/'+ image +'" />')

	$("#office-name-vice").html(vice_name)
	$("#office-img-vice").html('<img src="img/'+ vice_image +'" />')
}

const reset = () => {
	current = 0
	numbers = []
	inputAnimate()
	inputs.each(function () { $(this).val('') })
	$(".visible").removeClass('show').addClass('hidden')
	screenTransition('loading')
	setTimeout(() => { screenTransition('valid') }, 1000)
}

function save() {}