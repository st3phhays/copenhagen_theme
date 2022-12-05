'use strict';

const concat = require('gulp-concat');
const cleancss = require('gulp-clean-css');
const uglify = require('gulp-uglify-es').default;
const sass = require('gulp-sass')(require('sass'));
const clean = require('gulp-clean');
const purgecss = require('gulp-purgecss');
const rename = require('gulp-rename');
const merge = require('merge-stream');
const injectstring = require('gulp-inject-string');
const browserify = require('browserify');
const babelify = require('babelify');
const source = require('vinyl-source-stream');
const buffer = require('vinyl-buffer');
const util = require('gulp-util');
const inlinesource = require('gulp-inline-source');
const bundleconfig = require('./bundleconfig.json');
const zendeskconfig = require('./zendeskconfig.json');
// const fs = require('fs');

const editFilePartial = 'Edit this file at https://github.com/chocolatey/choco-theme/partials';
const { series, parallel, src, dest } = require('gulp');

const regex = {
    css: /\.css$/,
    js: /\.js$/
};

const paths = {
    templates: 'templates/',
    globalpartials: 'global-partials/',
    assets: 'assets/',
    partials: 'global-partials',
    node_modules: 'node_modules/',
    theme: 'node_modules/choco-theme/'
};

const getBundles = regexPattern => {
    return bundleconfig.filter(bundle => {
        return regexPattern.test(bundle.outputFileName);
    });
};

const getZendeskBundles = regexPattern => {
    return zendeskconfig.filter(bundle => {
        return regexPattern.test(bundle.outputFileName);
    });
};

const del = () => {
    return src([
        `${paths.assets}css`,
        `${paths.assets}js`,
        paths.partials
    ], { allowEmpty: true })
        .pipe(clean({ force: true }));
};

const copyTheme = () => {
    const copyThemeToggleHbs = src(`${paths.theme}partials/ThemeToggle.txt`)
        .pipe(injectstring.prepend(`---\npartial: themetoggle\n---\n{{!-- ${editFilePartial} --}}\n`))
        .pipe(rename({ basename: 'themetoggle', extname: '.hbs' }))
        .pipe(dest(paths.partials));

    const copyChocoThemeJs = src(`${paths.theme}js/**/*.js`)
        .pipe(dest(`${paths.assets}js/temp`));

    return merge(copyThemeToggleHbs, copyChocoThemeJs);
};

const compileSass = () => {
    return src(`${paths.theme}scss/zendesk.scss`)
        .pipe(sass().on('error', sass.logError))
        .pipe(dest(`${paths.assets}css`));
};

const compileJs = () => {
    const tasks = getBundles(regex.js).map(bundle => {
        const b = browserify({
            entries: bundle.inputFiles,
            debug: true,
            transform: [babelify.configure({
                presets: [
                    '@babel/preset-env',
                    ['@babel/preset-react', { runtime: 'automatic' }]
                ],
                compact: false
            })]
        });

        return b.bundle()
            .pipe(source(bundle.outputFileName))
            .pipe(buffer())
            .on('error', util.log)
            .pipe(dest('.'));
    });

    return merge(tasks);
};

const compileCss = () => {
    const tasks = getBundles(regex.css).map(bundle => {
        return src(bundle.inputFiles, { base: '.' })
            .pipe(concat(bundle.outputFileName))
            .pipe(dest('.'));
    });

    return merge(tasks);
};

const purgeCss = () => {
    return src(`${paths.assets}css/chocolatey.bundle.css`)
        .pipe(purgecss({
            content: [
                `${paths.templates}*.hbs`,
                `${paths.globalpartials}*.hbs`,
                `${paths.assets}js/*.*`,
                `${paths.assets}js/*.*.*`,
                `${paths.assets}js/*.*.*.*`
            ],
            safelist: [
                '::-webkit-scrollbar',
                '::-webkit-scrollbar-thumb',
                'link-light',
                'main',
                'table-bordered',
                'table-striped',
                'table-responsive-sm',
                'table-responsive',
                'clear-button',
                'recent-activity-item-meta',
                'fa-check',
                'fa-triangle-exclamation',
                'fa-info',
                'fa-xmark',
                'text-bg-warning',
                'text-bg-danger',
                'text-bg-success',
                'text-bg-info'
            ],
            keyframes: true,
            variables: true
        }))
        .pipe(dest(`${paths.assets}css/`));
};

const minCss = () => {
    const tasks = getBundles(regex.css).map(bundle => {
        return src(bundle.outputFileName, { base: '.' })
            .pipe(cleancss({
                level: 2,
                compatibility: 'ie8'
            }))
            .pipe(rename({ suffix: '.min' }))
            .pipe(dest('.'));
    });

    return merge(tasks);
};

const minJs = () => {
    const tasks = getBundles(regex.js).map(bundle => {
        return src(bundle.outputFileName, { base: '.' })
            .pipe(uglify())
            .pipe(rename({ suffix: '.min' }))
            .pipe(dest('.'));
    });

    return merge(tasks);
};

const zendeskCss = () => {
    const tasks = getZendeskBundles(regex.css).map(bundle => {
        return src(bundle.inputFiles, { base: '.' })
            .pipe(concat(bundle.outputFileName))
            .pipe(dest('.'));
    });

    return merge(tasks);
};

// If the JS/CSS included in the inline assets below need to be updated,
// replace the inline code with the tags specified above the function, and run `gulp`.

// document_head.hbs - <script type="text/javascript" src="../assets/js/chocolatey-head.bundle.min.js" inline></script>
// footer.hbs - <script type="text/javascript" src="../assets/js/chocolatey.bundle.min.js" inline></script>
const inlineAssets = () => {
    return src([`${paths.templates}footer.hbs`, `${paths.templates}document_head.hbs`])
        .pipe(inlinesource())
        .pipe(dest(paths.templates));
};

const delEnd = () => {
    return src([
        `${paths.assets}css`,
        `${paths.assets}js`,
        `${paths.assets}js/temp`
    ], { allowEmpty: true })
        .pipe(clean({ force: true }));
};

// Independednt tasks
exports.del = del;

// Gulp series
exports.compileSassJs = parallel(compileSass, compileJs);
exports.minCssJs = parallel(minCss, minJs);
exports.compileZendesk = parallel(zendeskCss, inlineAssets);

// Gulp default
exports.default = series(copyTheme, exports.compileSassJs, compileCss, purgeCss, exports.minCssJs, exports.compileZendesk, delEnd);