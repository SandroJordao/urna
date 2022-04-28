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

	$("#btn-blank").click(clickBlank)
	$("#btn-correct").click(clickCorrect)
	$("#btn-confirm").click(clickConfirm)
	$("#btn-reset").click(reset)

	setTimeout(() => {
		screenTransition('valid')
	}, 1000) 
});

const inputAnimate = () => {
	inputs.removeClass('input-animate')
	$(inputs[current]).addClass('input-animate')
}

const validClick = () => {
	return ['loading', 'end'].includes(screen)
}

const clickNumber = (number) => {
	if (validClick()) return false
	if (len_numbers < (current + 1)) return false
	console.log('Click Number: ' + number)
	$(inputs[current]).val(number)
	current++
	inputAnimate()
	numbers.push(number)
	if (len_numbers == current) validVote()
}

const clickBlank = () => {
	if (validClick()) return false
	console.log('Click Blank')
	screenTransition('blank')
}

const clickCorrect = () => {
	if (validClick()) return false
	console.log('Click Correct')
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
	if (validClick()) return false
	if (screen == 'valid' && len_numbers != current) return false
	$("#btn-confirm").prop("disabled", true)
	console.log('Click Confirm')

	/* Refatorar Aqui ... */
	if (screen == 'blank') {
		num_branco++
		$("#number-branco").html(num_branco)
		save(2)
	} else if (screen == 'null') {
		num_nulo++
		$("#number-nulo").html(num_nulo)
		save(3)
	} else if (screen == 'valid' && len_numbers == current) {
		let office = numbers.join('')
		$("#number-" + office).html( parseInt($("#number-" + office).html()) + 1 )
		save(1)
	}
	/* *** */

	screenTransition('loading')
	setTimeout(() => { 
		screenTransition('end')
		$("#btn-confirm").prop("disabled", false)
	}, 1000)
}

const screenTransition = (show, callback) => {
	if (screen == show) return false
	console.log('Transition: ' + show)
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
	var id = $("#office-" + office).attr('data-id')
	var name = $("#office-" + office).attr('data-name')
	var image = $("#office-" + office).attr('data-image')
	var vice_name = $("#office-" + office).attr('data-vice-name')
	var vice_image = $("#office-" + office).attr('data-vice-image')

	$("#candidato_id").val(id)
	$("#office-name").html(name)
	$("#office-img").html('<img src="img/'+ image +'" />')
	$("#office-name-vice").html(vice_name)
	$("#office-img-vice").html('<img src="img/'+ vice_image +'" />')

	$(".visible").removeClass('hidden').addClass('show')
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

function save(situacao) {
	var escola_id = $("#escola_id").val()
	var escola_nome = $("#escola_nome").val()
	var campanha_id = $("#campanha_id").val()
	var candidato_id = situacao == 1 ? $("#candidato_id").val() : ''
	
	var post = { 
		escola_id, 
		escola_nome, 
		campanha_id, 
		candidato_id, 
		situacao 
	}

	console.table(post)
}