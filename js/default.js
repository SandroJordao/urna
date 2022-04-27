/**
 * JS Document. 
 * @author Sandro Jordão.
 */

let screen = 'loading'
let numbers = 0
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
	numbers = inputs.length
	$("#screen-" + screen).show()

	inputAnimate()

	$(".bnt").click(function () { 
		clickNumber($(this).attr("data-valor")) 
	})

	$("#btn-branco").click(clickBlank)
	$("#btn-corrige").click(clickCorrect)
	$("#btn-confirma").click(clickConfirm)

	setTimeout(() => {
		screenTransition('valid')
	}, 1500) 
});

const inputAnimate = () => {
	inputs.removeClass('input-animate')
	$(inputs[current]).addClass('input-animate')
}

const clickNumber = (number) => {
	if (numbers < (current + 1)) return false
	$(inputs[current]).val(number)
	current++
	inputAnimate()
}

const clickBlank = () => {
	screenTransition('blank')
}

const clickCorrect = () => {
	inputs.each(function() {
		$(this).val('')
	})

	current = 0
	inputAnimate()

	if (screen != 'valid') screenTransition('valid')
}

const clickConfirm = () => {
	if (screen == 'blank') {
		num_branco++
		$("#number-branco").html(num_branco);
		screenTransition('end')
	}
}

const screenTransition = (show) => {
	$("#screen-" + screen).hide('fade', 300, () => {
		$("#screen-" + show).show('fade', 200)
		screen = show
	})
}

function save() {}