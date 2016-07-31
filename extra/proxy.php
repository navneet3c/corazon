<?php 
if ($_GET && $_GET['url']) {
  $url = $_GET['url'];
  $ch = curl_init();

  curl_setopt($ch,CURLOPT_URL, $url);

  curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
  
  /*
  curl_setopt($ch, CURLOPT_HTTPHEADER, array(
    'X-SPF-Referer: https://www.youtube.com/',
    'Referer: https://www.youtube.com/',
    'X-SPF-Previous: https://www.youtube.com/',
    'Host:www.youtube.com',
    'User-Agent: Mozilla/6.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.106 Safari/537.36'
  ));
  */

  $result = curl_exec($ch);
  curl_close($ch);
  echo $result;
}

