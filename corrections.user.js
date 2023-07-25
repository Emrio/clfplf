// ==UserScript==
// @name        corrections
// @namespace   École polytechnique r/place
// @match       https://garlic-bread.reddit.com/embed*
// @grant       GM.setValue
// @grant       GM.getValue
// @grant       GM.xmlHttpRequest
// @version     1.0
// @author      Emrio
// @description Pour la Patrie, les Sciences et la Gloire !
// ==/UserScript==

(function () {
  // loaded via config
  const COLORS = {}
  const TEMPLATES = []
  const TOPLEFT = { x: NaN, y: NaN }
  let lastConfigCheck = 0

  const CONFIG_URL = 'https://static.emrio.fr/f/r-place-polytechnique/config.json'
  const BASE_URL = 'https://garlic-bread.reddit.com/embed'

  init()

  // Utility functions

  function randomInteger (a, b) {
    return Math.floor(Math.random() * (b - a)) + a
  }

  /** Delay is in milliseconds */
  function sleep (delay) {
    return new Promise(resolve => setTimeout(resolve, delay))
  }

  /** Convenient query selector */
  function $embed () {
    return document
      .querySelector('garlic-bread-embed')
      .shadowRoot
      .querySelector(...arguments)
  }

  // Config

  /** Update bot config from remote at regular time intervals */
  function updateConfig () {
    return new Promise((resolve, reject) => {
      if (Date.now() - lastConfigCheck < 1000 * 60) {
        return resolve()
      }

      GM.xmlHttpRequest({
        method: 'GET',
        url: CONFIG_URL,
        onload: (response) => {
          try {
            const config = JSON.parse(response.responseText)

            Object.assign(COLORS, config.colors)
            TEMPLATES.splice(0, TEMPLATES.length, ...config.templates)
            Object.assign(TOPLEFT, config.topLeft)

            lastConfigCheck = Date.now()
            resolve()
          } catch (err) {
            reject(err)
          }
        },
        onerror: reject
      })
    })
  }

  // Canvas helpers

  function getPixel (context, x, y) {
    const data = context.getImageData(x, y, 1, 1).data
    return [data[0], data[1], data[2]]
  }

  function toCanvasCoords (x, y) {
    const canvasX = x - TOPLEFT.x
    const canvasY = y - TOPLEFT.y
    return [canvasX, canvasY]
  }

  function findColorByRGB (rgb) {
    for (const color in COLORS) {
      if (COLORS[color].rgb.every((value, index) => value === rgb[index])) {
        return color
      }
    }

    return null
  }

  function getTemplateCorrections (context, pattern, topLeft) {
    const [originX, originY] = toCanvasCoords(topLeft.x, topLeft.y)
    const patternWidth = pattern[0].length
    const patternHeight = pattern.length

    const corrections = []

    for (let patternY = 0; patternY < patternHeight; patternY++) {
      for (let patternX = 0; patternX < patternWidth; patternX++) {
        const targetColor = pattern[patternY][patternX]

        if (targetColor === '_') {
          continue
        }

        const canvasX = originX + patternX
        const canvasY = originY + patternY

        const pixelData = getPixel(context, canvasX, canvasY)
        const actualColor = findColorByRGB(pixelData)

        if (actualColor !== targetColor) {
          const placeX = topLeft.x + patternX
          const placeY = topLeft.y + patternY

          corrections.push({
            x: placeX,
            y: placeY,
            targetColor,
            actualColor
          })
        }
      }
    }

    return corrections
  }

  function getAllCorrections () {
    const canvas = $embed('garlic-bread-canvas')
      .shadowRoot
      .querySelector('canvas')
    const context = canvas.getContext('2d')

    const corrections = []

    for (const { pattern, topLeft } of TEMPLATES) {
      corrections.push(...getTemplateCorrections(context, pattern, topLeft))
    }

    return corrections
  }

  // GUI helpers

  function getRemainingTime () {
    const attribute = $embed('garlic-bread-status-pill')
      .attributes['next-tile-available-in']
    const value = attribute ? parseInt(attribute.value) : 0

    return value
  }

  /** Pixel color is saved in the GreaseMonkey key-value store */
  async function placePixel () {
    const savedColorCode = await GM.getValue('colorCode')

    if (!savedColorCode) {
      console.warn('Color code is not set :/')
    }

    const colorCode = savedColorCode || COLORS['R'].code

    const playButton = $embed('garlic-bread-status-pill')
      .shadowRoot
      .querySelector('button')

    if (playButton) {
      playButton.click()
    }
    await sleep(200)

    const colorButton = $embed('garlic-bread-color-picker')
      .shadowRoot
      .querySelector(`button.color[data-color="${colorCode}"]`)

    if (colorButton) {
      colorButton.click()
    }
    await sleep(200)

    const confirmButton = $embed('garlic-bread-color-picker')
      .shadowRoot
      .querySelector('button.confirm')

    confirmButton.click()
  }

  // Bot logic

  /** Main bot cycle logic */
  async function run () {
    await updateConfig()

    const remainingTime = getRemainingTime()
    const corrections = getAllCorrections()
    const currentParams = new URLSearchParams(location.href)
    const cx = parseInt(currentParams.get('cx'))
    const cy = parseInt(currentParams.get('cy'))
    const currentCorrection = corrections.find(corr => corr.x === cx && corr.y === cy)

    if (remainingTime % 5 === 0) {
      console.log('[polytechnique] Corrections:', corrections)
    }
    return

    if (remainingTime > 30) {
      return
    }

    console.log('[polytechnique] Remaining time:', remainingTime)

    if (remainingTime === 0 && !!currentCorrection) {
      console.log('[polytechnique] Placing pixel...')
      return placePixel()
    }

    console.log('[polytechnique] Corrections:', corrections.length)

    if (corrections.length === 0) {
      console.log('[polytechnique] No corrections found.')
      await sleep(randomInteger(1000, 120000))
      return
    }

    if (currentCorrection) {
      if (10 < remainingTime && remainingTime < 15) {
        console.log('[polytechnique] Refreshing page...')
        location.reload()
      }

      await GM.setValue('colorCode', COLORS[currentCorrection.targetColor].code)
      console.log('[polytechnique] Waiting for pixel...')
      return
    }

    const correction = corrections[randomInteger(0, corrections.length)]

    await GM.setValue('colorCode', COLORS[correction.targetColor].code)

    const newParams = new URLSearchParams()
    newParams.set('screenmode', 'fullscreen')
    newParams.set('cx', correction.x.toString())
    newParams.set('cy', correction.y.toString())
    newParams.set('px', '8')
    newParams.set('locale', 'fr-FR')

    console.log('[polytechnique] Locking on new target.')
    console.log('[polytechnique] Coordinates:', correction.x, ",", correction.y, ".")
    console.log('[polytechnique] Target color:', correction.targetColor)
    console.log('[polytechnique] Actual color:', correction.actualColor)

    location.href = `${BASE_URL}?${newParams}`
  }

  async function loop () {
    try {
      await run()
    } catch (err) {
      console.error('[polytechnique] Execution failed:', err)
    }

    setTimeout(loop, 800)
  }

  async function init () {
    await sleep(2000)

    console.log('[polytechnique] Hello, world!')
    loop()
  }
})()
